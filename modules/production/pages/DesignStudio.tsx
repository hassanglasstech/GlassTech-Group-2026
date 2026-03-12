
import React, { useState, useMemo } from 'react';
import { Company } from '../../shared/types';
import { 
  Maximize, Ruler, Download, Save, Grid3X3, Monitor, 
  Layout, Square, Columns, PanelTop, 
  DoorOpen, Bath, Home, ArrowUpCircle, Plus, X, 
  ArrowLeftRight, Info, Settings2, Trash2, Layers,
  ChevronRight, ChevronDown, MoveHorizontal, ZoomIn, ZoomOut, RefreshCcw,
  MousePointer2, PenTool
} from 'lucide-react';

// --- DATA MODELS ---

type DesignCategory = 'Windows' | 'Doors' | 'Partitions' | 'Specialty';
type OpeningType = 'Fixed' | 'Sliding' | 'Casement' | 'Awning' | 'Folding' | 'TiltTurn';

interface DesignTemplate {
  id: string;
  name: string;
  type: OpeningType;
  defaultSashes: number;
  icon: React.ElementType;
  nomenclature: string; // e.g. "XO", "O"
}

const CATALOG: Record<DesignCategory, DesignTemplate[]> = {
  'Windows': [
    { id: 'w-fix', name: 'Fixed View', type: 'Fixed', defaultSashes: 1, icon: Square, nomenclature: 'O' },
    { id: 'w-case-1', name: 'Casement (1-Sash)', type: 'Casement', defaultSashes: 1, icon: Layout, nomenclature: 'X' },
    { id: 'w-slide-2', name: 'Sliding (2-Track)', type: 'Sliding', defaultSashes: 2, icon: Columns, nomenclature: 'XO' },
    { id: 'w-slide-3', name: 'Sliding (3-Track)', type: 'Sliding', defaultSashes: 3, icon: Columns, nomenclature: 'XOX' },
    { id: 'w-awn', name: 'Awning / Top Hung', type: 'Awning', defaultSashes: 1, icon: PanelTop, nomenclature: 'V' },
  ],
  'Doors': [
    { id: 'd-hinge-1', name: 'Single Swing Door', type: 'Casement', defaultSashes: 1, icon: DoorOpen, nomenclature: 'X' },
    { id: 'd-hinge-2', name: 'Double French Door', type: 'Casement', defaultSashes: 2, icon: DoorOpen, nomenclature: 'XX' },
    { id: 'd-slide-2', name: 'Patio Slider', type: 'Sliding', defaultSashes: 2, icon: Columns, nomenclature: 'XO' },
    { id: 'd-fold-3', name: 'Bi-Fold (3-Leaf)', type: 'Folding', defaultSashes: 3, icon: ArrowLeftRight, nomenclature: 'XXX' },
  ],
  'Partitions': [
    { id: 'p-grid', name: 'Office Grid', type: 'Fixed', defaultSashes: 4, icon: Grid3X3, nomenclature: 'OOOO' },
  ],
  'Specialty': [
    { id: 's-shower', name: 'Shower Cubicle', type: 'Casement', defaultSashes: 2, icon: Bath, nomenclature: 'XO' },
    { id: 's-sky', name: 'Skylight', type: 'Fixed', defaultSashes: 1, icon: ArrowUpCircle, nomenclature: 'O' },
  ]
};

// --- COMPONENT ---

import { useAppStore } from '../../shared/store/appStore';

const DesignStudio: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  // State
  const [activeCategory, setActiveCategory] = useState<DesignCategory>('Windows');
  const [selectedTemplate, setSelectedTemplate] = useState<DesignTemplate>(CATALOG['Windows'][2]);
  
  const [config, setConfig] = useState({
    width: 6,
    height: 4,
    sashes: 2,
    system: company === 'GTK' ? 'Chawla Aluminium 26mm' : 'GTI Tempered 12mm',
    finish: 'Champagne',
    glass: '6mm Clear',
    zoom: 1,
    showDims: true,
    showSymbols: true
  });

  // Handlers
  const handleTemplateSelect = (t: DesignTemplate) => {
    setSelectedTemplate(t);
    setConfig(prev => ({ ...prev, sashes: t.defaultSashes }));
  };

  // --- RENDER HELPERS ---

  const renderBlueprintGrid = () => (
    <pattern id="blueprintGrid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1"/>
    </pattern>
  );

  const renderOpeningSymbols = (sx: number, sy: number, sw: number, sh: number, index: number) => {
    if (!config.showSymbols) return null;
    const type = selectedTemplate.type;
    const stroke = "#3b82f6"; // Blue for symbols
    const dash = "4,2";

    // 1. SLIDING ARROW
    if (type === 'Sliding') {
        const isMovable = index % 2 !== 0; // Simple logic: even fixed, odd moves (XO)
        if (!isMovable) return null;
        const cy = sy + sh / 2;
        const cx = sx + sw / 2;
        return (
            <g>
                <line x1={cx - 15} y1={cy} x2={cx + 15} y2={cy} stroke={stroke} strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d={`M ${cx + 10} ${cy - 5} L ${cx + 15} ${cy} L ${cx + 10} ${cy + 5}`} fill="none" stroke={stroke} strokeWidth="2" />
            </g>
        );
    }

    // 2. CASEMENT TRIANGLE (Hinge Indicator)
    if (type === 'Casement') {
        // Triangle pointing to hinge (Assuming left hinge for sash 0, right for sash 1)
        const hingeX = index === 0 ? sx : sx + sw;
        return (
            <g opacity="0.5">
                <line x1={hingeX} y1={sy} x2={sx + sw/2} y2={sy + sh/2} stroke={stroke} strokeWidth="1" strokeDasharray={dash} />
                <line x1={hingeX} y1={sy + sh} x2={sx + sw/2} y2={sy + sh/2} stroke={stroke} strokeWidth="1" strokeDasharray={dash} />
            </g>
        );
    }

    // 3. AWNING (Top Hung)
    if (type === 'Awning') {
        return (
            <g opacity="0.5">
                <line x1={sx} y1={sy + sh} x2={sx + sw/2} y2={sy} stroke={stroke} strokeWidth="1" strokeDasharray={dash} />
                <line x1={sx + sw} y1={sy + sh} x2={sx + sw/2} y2={sy} stroke={stroke} strokeWidth="1" strokeDasharray={dash} />
            </g>
        );
    }

    return null;
  };

  const renderVisual = () => {
    // Canvas Logic
    const canvasW = 600;
    const canvasH = 500;
    const padding = 60;
    
    // Scaling Logic: Fit visual into canvas while maintaining aspect ratio
    const availableW = canvasW - (padding * 2);
    const availableH = canvasH - (padding * 2);
    
    const scaleW = availableW / config.width;
    const scaleH = availableH / config.height;
    const scale = Math.min(scaleW, scaleH) * config.zoom;

    const drawW = config.width * scale;
    const drawH = config.height * scale;
    
    const startX = (canvasW - drawW) / 2;
    const startY = (canvasH - drawH) / 2;

    const frameColor = "#1e293b"; // Slate 800
    const glassColor = "#bfdbfe"; // Blue 200
    
    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${canvasW} ${canvasH}`} className="drop-shadow-2xl">
            <defs>
                {renderBlueprintGrid()}
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
            </defs>
            <rect width="100%" height="100%" fill="url(#blueprintGrid)" />

            {/* Main Frame */}
            <rect x={startX} y={startY} width={drawW} height={drawH} fill="#f8fafc" stroke={frameColor} strokeWidth="4" />

            {/* Sashes */}
            {Array.from({length: config.sashes}).map((_, i) => {
                const sashW = drawW / config.sashes;
                const sx = startX + (i * sashW);
                
                return (
                    <g key={i}>
                        {/* Sash Frame */}
                        <rect x={sx + 2} y={startY + 2} width={sashW - 4} height={drawH - 4} fill={glassColor} fillOpacity="0.2" stroke={frameColor} strokeWidth="2" />
                        
                        {/* Opening Symbol */}
                        {renderOpeningSymbols(sx, startY, sashW, drawH, i)}
                    </g>
                )
            })}

            {/* Dimensions */}
            {config.showDims && (
                <g className="select-none">
                    {/* Width Dim */}
                    <line x1={startX} y1={startY - 20} x2={startX + drawW} y2={startY - 20} stroke="#64748b" strokeWidth="1" />
                    <line x1={startX} y1={startY - 25} x2={startX} y2={startY - 15} stroke="#64748b" strokeWidth="1" />
                    <line x1={startX + drawW} y1={startY - 25} x2={startX + drawW} y2={startY - 15} stroke="#64748b" strokeWidth="1" />
                    <rect x={startX + drawW/2 - 25} y={startY - 30} width="50" height="20" rx="4" fill="white" stroke="#e2e8f0" />
                    <text x={startX + drawW/2} y={startY - 16} textAnchor="middle" className="text-[10px] font-bold fill-slate-700 font-mono">{config.width} FT</text>

                    {/* Height Dim */}
                    <line x1={startX - 20} y1={startY} x2={startX - 20} y2={startY + drawH} stroke="#64748b" strokeWidth="1" />
                    <line x1={startX - 25} y1={startY} x2={startX - 15} y2={startY} stroke="#64748b" strokeWidth="1" />
                    <line x1={startX - 25} y1={startY + drawH} x2={startX - 15} y2={startY + drawH} stroke="#64748b" strokeWidth="1" />
                    <rect x={startX - 45} y={startY + drawH/2 - 10} width="50" height="20" rx="4" fill="white" stroke="#e2e8f0" transform={`rotate(-90 ${startX - 20} ${startY + drawH/2})`} />
                    <text x={startX - 20} y={startY + drawH/2} textAnchor="middle" transform={`rotate(-90 ${startX - 20} ${startY + drawH/2})`} className="text-[10px] font-bold fill-slate-700 font-mono" dy="4">{config.height} FT</text>
                </g>
            )}
        </svg>
    );
  };

  return (
    <div className="flex h-[calc(100vh-120px)] bg-slate-50 border rounded-3xl overflow-hidden shadow-sm border-slate-200">
      {/* 1. LIBRARY SIDEBAR */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-20">
         <div className="p-5 border-b border-slate-100">
            <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Grid3X3 size={18} className="text-blue-600"/> Design Library
            </h3>
         </div>
         
         <div className="flex-1 overflow-y-auto">
            {Object.keys(CATALOG).map(cat => (
                <div key={cat} className="border-b border-slate-50">
                    <button 
                        onClick={() => setActiveCategory(cat as DesignCategory)} 
                        className={`w-full flex items-center justify-between p-4 text-xs font-bold uppercase transition-all ${activeCategory === cat ? 'bg-slate-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <span>{cat}</span>
                        {activeCategory === cat ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                    </button>
                    
                    {activeCategory === cat && (
                        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50/50">
                            {CATALOG[cat].map(temp => (
                                <button 
                                    key={temp.id}
                                    onClick={() => handleTemplateSelect(temp)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedTemplate.id === temp.id ? 'border-blue-600 bg-white shadow-md' : 'border-transparent hover:bg-white hover:border-slate-200'}`}
                                >
                                    <temp.icon size={24} className={selectedTemplate.id === temp.id ? 'text-blue-600' : 'text-slate-400'} strokeWidth={1.5} />
                                    <span className={`text-[9px] font-bold uppercase mt-2 text-center leading-tight ${selectedTemplate.id === temp.id ? 'text-blue-700' : 'text-slate-500'}`}>{temp.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
         </div>
      </div>

      {/* 2. CANVAS AREA */}
      <div className="flex-1 bg-[#f1f5f9] relative flex flex-col">
         {/* Toolbar */}
         <div className="absolute top-4 left-4 right-4 flex justify-between z-10 pointer-events-none">
             <div className="flex space-x-2 pointer-events-auto bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                 <button onClick={() => setConfig({...config, zoom: Math.min(config.zoom + 0.1, 2)})} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500"><ZoomIn size={18}/></button>
                 <button onClick={() => setConfig({...config, zoom: Math.max(config.zoom - 0.1, 0.5)})} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500"><ZoomOut size={18}/></button>
                 <button onClick={() => setConfig({...config, zoom: 1})} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500"><RefreshCcw size={18}/></button>
             </div>
             <div className="flex space-x-2 pointer-events-auto bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                 <button onClick={() => setConfig({...config, showDims: !config.showDims})} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${config.showDims ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Dims</button>
                 <button onClick={() => setConfig({...config, showSymbols: !config.showSymbols})} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${config.showSymbols ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Symbols</button>
             </div>
         </div>

         {/* The Drawing Board */}
         <div className="flex-1 overflow-hidden cursor-crosshair">
             {renderVisual()}
         </div>

         <div className="h-8 bg-white border-t flex items-center px-4 justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
             <span>Scale: {(config.zoom * 100).toFixed(0)}%</span>
             <span>Coordinates: {config.width}' x {config.height}'</span>
         </div>
      </div>

      {/* 3. PROPERTIES INSPECTOR */}
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-20">
         <div className="p-5 border-b border-slate-100">
            <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Settings2 size={18} className="text-slate-400"/> Specs Inspector
            </h3>
         </div>

         <div className="flex-1 overflow-y-auto p-6 space-y-8">
             {/* Dimensions */}
             <div className="space-y-4">
                 <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-1">Geometry</h4>
                 <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Width (Ft)</label>
                         <div className="relative">
                             <input type="number" value={config.width} onChange={e => setConfig({...config, width: Number(e.target.value)})} className="w-full p-2 pl-8 bg-slate-50 border rounded-lg font-black text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                             <MoveHorizontal size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                         </div>
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] font-bold text-slate-500 uppercase">Height (Ft)</label>
                         <div className="relative">
                             <input type="number" value={config.height} onChange={e => setConfig({...config, height: Number(e.target.value)})} className="w-full p-2 pl-8 bg-slate-50 border rounded-lg font-black text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                             <ArrowUpCircle size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                         </div>
                     </div>
                 </div>
                 <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Sash Count</label>
                     <input type="number" value={config.sashes} onChange={e => setConfig({...config, sashes: Number(e.target.value)})} className="w-full p-2 bg-slate-50 border rounded-lg font-black text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                 </div>
             </div>

             {/* System Config */}
             <div className="space-y-4">
                 <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b pb-1">Material Config</h4>
                 <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Profile System</label>
                     <select value={config.system} onChange={e => setConfig({...config, system: e.target.value})} className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500">
                         {company === 'GTK' ? (
                             <>
                                <option>Chawla Aluminium 26mm</option>
                                <option>Prime Sliding 100mm</option>
                                <option>Alcop Heavy Duty</option>
                             </>
                         ) : (
                             <>
                                <option>GTI Tempered 12mm</option>
                                <option>GTI Laminated Safety</option>
                             </>
                         )}
                     </select>
                 </div>
                 <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Glass Type</label>
                     <select value={config.glass} onChange={e => setConfig({...config, glass: e.target.value})} className="w-full p-2 bg-slate-50 border rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500">
                         <option>5mm Clear Float</option>
                         <option>6mm Clear Tempered</option>
                         <option>12mm Clear Tempered</option>
                         <option>Double Glazed 6+12+6</option>
                     </select>
                 </div>
                 <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-500 uppercase">Profile Finish</label>
                     <div className="flex gap-2">
                         {['Champagne', 'White', 'Black', 'Wood'].map(c => (
                             <button 
                                key={c} 
                                onClick={() => setConfig({...config, finish: c})}
                                className={`w-6 h-6 rounded-full border-2 ${config.finish === c ? 'border-blue-600 scale-110' : 'border-slate-200'}`}
                                style={{ backgroundColor: c === 'Champagne' ? '#fde047' : c === 'White' ? '#fff' : c === 'Black' ? '#000' : '#78350f' }}
                                title={c}
                             />
                         ))}
                     </div>
                 </div>
             </div>
         </div>

         {/* Footer Action */}
         <div className="p-5 border-t border-slate-200 bg-slate-50">
             <div className="flex justify-between items-center mb-4">
                 <span className="text-[10px] font-black uppercase text-slate-400">Total Area</span>
                 <span className="text-lg font-black text-slate-800">{(config.width * config.height).toFixed(2)} <span className="text-[10px]">SqFt</span></span>
             </div>
             <button className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
                 <Plus size={14}/> <span>Add to Quote</span>
             </button>
         </div>
      </div>
    </div>
  );
};

export default DesignStudio;
