import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Company, WarehouseSpot, ProductionPiece } from '@/modules/shared/types';
import { ProductionService } from '@/modules/production/services/productionService';
import { 
  Warehouse, LayoutGrid, Plus, X, Trash2, MapPin, 
  Layers, Package, Info, Search, Save, ChevronRight, Activity, Box
} from 'lucide-react';

const NipponWarehouseModule: React.FC<{ company: Company }> = ({ company }) => {
  const [activeTab, setActiveTab] = useState<'visual' | 'settings'>('visual');
  const [spots, setSpots] = useState<WarehouseSpot[]>([]);
  const [pieces, setPieces] = useState<ProductionPiece[]>([]);
  const [isSpotModalOpen, setIsSpotModalOpen] = useState(false);
  const [newSpot, setNewSpot] = useState<Partial<WarehouseSpot>>({ code: '', zone: 'Servicing' });
  
  // Phase 3: Traceability Search
  const [traceSearch, setTraceSearch] = useState('');

  useEffect(() => {
    refreshData();
  }, [company, activeTab]);

  const refreshData = () => {
    setSpots(ProductionService.getWarehouseSpots().filter(s => s.company === company));
    setPieces(ProductionService.getProductionPieces());
  };

  const handleSaveSpot = () => {
    if (!newSpot.code) return toast.error("Code is required.", { duration: 4000 });
    const spot: WarehouseSpot = {
      id: `SPOT-${Date.now()}`,
      company,
      code: newSpot.code.toUpperCase(),
      zone: newSpot.zone as any
    };
    ProductionService.saveWarehouseSpots([...ProductionService.getWarehouseSpots(), spot]);
    refreshData();
    setIsSpotModalOpen(false);
    setNewSpot({ code: '', zone: 'Servicing' });
  };

  const handleDeleteSpot = (id: string) => {
    if (pieces.some(p => p.spotId === id)) return toast.error("Cannot delete: Pieces are currently assigned to this spot.", { duration: 4000 });
    ProductionService.saveWarehouseSpots(ProductionService.getWarehouseSpots().filter(s => s.id !== id));
    refreshData();
  };

  const getPiecesInSpot = (spotId: string) => pieces.filter(p => p.spotId === spotId);

  // Phase 3: Traceability Highlight Logic
  const isSpotHighlighted = (spotId: string) => {
    if (!traceSearch) return false;
    const items = getPiecesInSpot(spotId);
    return items.some(p => p.id.toLowerCase().includes(traceSearch.toLowerCase()) || p.orderId.toLowerCase().includes(traceSearch.toLowerCase()));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-2 rounded-2xl border w-full shadow-sm">
        <div className="flex items-center space-x-1">
          <button onClick={() => setActiveTab('visual')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'visual' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <LayoutGrid size={16} /><span>Warehouse Map</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeTab === 'settings' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <MapPin size={16} /><span>Spot Maintenance</span>
          </button>
        </div>
        {activeTab === 'visual' && (
          <div className="relative w-80 mr-2">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
             <input 
               type="text" 
               placeholder="Trace Piece ID..." 
               className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl font-bold text-xs uppercase focus:ring-2 focus:ring-red-500 outline-none transition-all"
               value={traceSearch}
               onChange={e => setTraceSearch(e.target.value)}
             />
          </div>
        )}
      </div>

      {activeTab === 'visual' && (
        <div className="space-y-12 animate-in fade-in duration-500">
           {(['Servicing', 'Tempering', 'Delivery'] as const).map(zone => (
             <div key={zone} className="space-y-4">
                <div className="flex items-center space-x-4 border-b pb-2">
                   <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{zone} Zone</h3>
                   <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase">{spots.filter(s => s.zone === zone).length} Available Bins</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                   {spots.filter(s => s.zone === zone).map(spot => {
                      const spotPieces = getPiecesInSpot(spot.id);
                      const highlighted = isSpotHighlighted(spot.id);
                      return (
                        <div key={spot.id} className={`rounded-3xl border p-6 flex flex-col items-center justify-center text-center space-y-3 transition-all group relative overflow-hidden ${highlighted ? 'bg-red-600 border-red-600 shadow-xl ring-4 ring-red-200' : 'bg-white border-slate-200 hover:shadow-xl'}`}>
                           <div className={`p-3 rounded-2xl transition-all ${highlighted ? 'bg-white text-red-600' : 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white'}`}>
                              <Box size={24}/>
                           </div>
                           <div>
                              <p className={`font-black leading-none ${highlighted ? 'text-white' : 'text-slate-900'}`}>{spot.code}</p>
                              <p className={`text-[10px] font-bold mt-1 uppercase tracking-widest ${highlighted ? 'text-red-100' : 'text-slate-400'}`}>{spotPieces.length} Items</p>
                           </div>
                           {(spotPieces.length > 0 && !highlighted) && (
                             <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-sm animate-pulse"></div>
                           )}
                           {highlighted && (
                             <div className="absolute inset-0 bg-red-400/20 animate-pulse pointer-events-none"></div>
                           )}
                        </div>
                      );
                   })}
                   {spots.filter(s => s.zone === zone).length === 0 && (
                     <div className="col-span-full py-12 bg-slate-50 border-2 border-dashed rounded-3xl text-center text-slate-300 font-bold uppercase text-xs italic">No spots defined for this zone.</div>
                   )}
                </div>
             </div>
           ))}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 animate-in slide-in-from-right">
           <div className="bg-red-600 text-white p-8 rounded-[2.5rem] shadow-xl flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><MapPin size={120} /></div>
              <div>
                 <h2 className="text-2xl font-black uppercase">Physical Spot Maintenance</h2>
                 <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest mt-1">Industrial Rack & Floor Assignment Protocol</p>
              </div>
              <button onClick={() => setIsSpotModalOpen(true)} className="bg-white text-red-900 px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-slate-900 hover:text-white transition-all active:scale-95 flex items-center space-x-3 relative z-10">
                 <Plus size={18}/> <span>Create New Bin</span>
              </button>
           </div>

           <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
              <table className="w-full text-left sap-table">
                 <thead><tr><th>Bin Code</th><th>Industrial Zone</th><th>Capacity Load</th><th>Status</th><th>Actions</th></tr></thead>
                 <tbody>
                    {spots.map(spot => (
                      <tr key={spot.id}>
                         <td className="font-black text-red-600">{spot.code}</td>
                         <td><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">{spot.zone} Area</span></td>
                         <td className="font-bold">{getPiecesInSpot(spot.id).length} Pieces</td>
                         <td><div className="flex items-center space-x-2"><div className={`w-2 h-2 rounded-full ${getPiecesInSpot(spot.id).length > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}></div><span className="text-xs font-black uppercase text-slate-500">{getPiecesInSpot(spot.id).length > 0 ? 'Occupied' : 'Vacant'}</span></div></td>
                         <td><button onClick={() => handleDeleteSpot(spot.id)} className="p-2 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button></td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {isSpotModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
           <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200 border">
              <div className="px-8 py-6 bg-red-600 text-white flex justify-between items-center shrink-0">
                 <div><h3 className="text-xl font-black uppercase">Create Warehouse Bin</h3><p className="text-[10px] font-bold text-red-200 uppercase">Traceability Control Point</p></div>
                 <button onClick={() => setIsSpotModalOpen(false)}><X size={24}/></button>
              </div>
              <div className="p-10 space-y-6 bg-slate-50">
                 <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Spot / Bin Code</label><input type="text" placeholder="e.g. RCK-01" value={newSpot.code} onChange={e => setNewSpot({...newSpot, code: e.target.value})} className="w-full p-4 bg-white border rounded-2xl font-black uppercase outline-none focus:border-red-600" /></div>
                 <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-slate-400 ml-1">Warehouse Zone</label><select value={newSpot.zone} onChange={e => setNewSpot({...newSpot, zone: e.target.value as any})} className="w-full p-4 bg-white border rounded-2xl font-black outline-none"><option value="Servicing">Servicing Area (WIP)</option><option value="Tempering">Tempering Area (Ready)</option><option value="Delivery">Delivery Area (Finished Goods)</option></select></div>
              </div>
              <div className="px-10 py-6 bg-white border-t flex justify-end space-x-4">
                 <button onClick={() => setIsSpotModalOpen(false)} className="px-6 py-2 text-slate-400 font-black uppercase text-xs">Cancel</button>
                 <button onClick={handleSaveSpot} className="bg-red-600 text-white px-10 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Define Spot</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default NipponWarehouseModule;
