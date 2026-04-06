
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
           <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl">
              <BarChart3 size={14} className="text-slate-600 shrink-0"/>
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">Production Analytics</span>
              <span className="text-[10px] text-slate-400 font-bold">Live floor · Bottleneck detection</span>
              <span className="ml-auto text-xs font-black text-rose-600 bg-rose-50 px-3 py-0.5 rounded-full">Defect Rate: {((analyticsData.defects / analyticsData.total) * 100).toFixed(1)}%</span>
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
