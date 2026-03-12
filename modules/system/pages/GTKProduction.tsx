import React from 'react';

const GTKProduction: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-200px)]">
      <div className="text-center p-12 bg-white rounded-[2rem] border border-slate-200 shadow-sm max-w-lg">
        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">GTK Production</h2>
        <div className="h-1 w-20 bg-blue-600 mx-auto my-4 rounded-full"></div>
        <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Aluminium Fabrication & Assembly</p>
        <p className="text-slate-400 text-xs mt-4">This module is initialized and ready for workflow configuration.</p>
      </div>
    </div>
  );
};

export default GTKProduction;