
import React from 'react';
import { BarChart3 } from 'lucide-react';

interface AnalyticsViewProps {
    analyticsData: {
        total: number;
        cut: number;
        qcPassed: number;
        tempered: number;
        delivered: number;
        defects: number;
        sortedTypes: [string, number][];
    };
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analyticsData }) => {
    return (
        <div className="space-y-8 animate-in zoom-in duration-300">
           <div className="bg-slate-800 text-white p-8 rounded-[2.5rem] shadow-xl flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><BarChart3 size={160}/></div>
              <div className="relative z-10">
                 <h2 className="text-3xl font-black uppercase tracking-tight">Production Capacity Engine</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Live Floor Analytics & Bottleneck Detection</p>
              </div>
              <div className="bg-white/10 px-6 py-4 rounded-2xl border border-white/10 relative z-10">
                 <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Defect Rate</p>
                 <p className="text-3xl font-black text-rose-400">{((analyticsData.defects / analyticsData.total) * 100).toFixed(1)}%</p>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col items-center justify-center text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest mb-2">Work in Progress (Cut)</p>
                 <p className="text-4xl font-black text-blue-600">{analyticsData.cut}</p>
                 <div className="w-full h-2 bg-slate-100 rounded-full mt-4 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${(analyticsData.cut/analyticsData.total)*100}%` }}></div></div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col items-center justify-center text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest mb-2">Ready / QC Passed</p>
                 <p className="text-4xl font-black text-emerald-600">{analyticsData.qcPassed}</p>
                 <div className="w-full h-2 bg-slate-100 rounded-full mt-4 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${(analyticsData.qcPassed/analyticsData.total)*100}%` }}></div></div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col items-center justify-center text-center">
                 <p className="text-[10px] font-black uppercase tracking-widest mb-2">Total Output (Delivered)</p>
                 <p className="text-4xl font-black text-indigo-600">{analyticsData.delivered}</p>
                 <div className="w-full h-2 bg-slate-100 rounded-full mt-4 overflow-hidden"><div className="h-full bg-indigo-600" style={{ width: `${(analyticsData.delivered/analyticsData.total)*100}%` }}></div></div>
              </div>
           </div>
        </div>
    );
};

export default AnalyticsView;
