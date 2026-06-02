
import React from 'react';
import { Product } from '../../shared/types';
import { getBrandNick } from '../../shared/utils/brandUtils';

interface Props {
    products: Product[];
}

export const NipponCatalogPrint: React.FC<Props> = ({ products }) => {
    return (
        <div className="bg-white text-black p-0 font-sans leading-tight">
            <style>{`
                @media print {
                    @page { 
                        size: A4; 
                        margin: 10mm; 
                    }
                    body {
                        margin: 10mm 12mm;
                        padding: 0;
                    }
                    .catalog-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 10mm;
                    }
                    .catalog-card {
                        page-break-inside: avoid; }
                    thead { display: table-header-group; }
                    tr { page-break-inside: avoid;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 5mm;
                        display: flex;
                        flex-direction: column;
                    }
                }
            `}</style>
            
            <div className="mb-8 text-center">
                <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Nippon Hardware Catalog</h1>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Premium Hardware & Accessories</p>
                <div className="w-24 h-1 bg-red-600 mx-auto mt-2"></div>
            </div>

            <div className="catalog-grid">
                {products.map(p => (
                    <div key={p.id} className="catalog-card">
                        <div className="aspect-square bg-slate-50 rounded-lg overflow-hidden mb-4 flex items-center justify-center border border-slate-100">
                            {p.imageUrl ? (
                                <img src={p.imageUrl} alt={p.description} className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-slate-200 uppercase font-black text-[10px]">No Image</div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-black text-slate-900 uppercase text-sm leading-tight">{p.description}</h3>
                                <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 uppercase">
                                    {p.modelNo || 'N/A'}
                                </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-bold text-slate-500 uppercase border-t border-slate-100 pt-2 mt-2">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Brand:</span>
                                    <span className="text-slate-900">{getBrandNick(p.brand || 'Generic')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Finish:</span>
                                    <span className="text-slate-900">{p.finishColor || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Material:</span>
                                    <span className="text-slate-900">{p.material || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Size:</span>
                                    <span className="text-slate-900">{p.tongueLength || p.thickness || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-12 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-4">
                © 2026 GlassTech Group - Nippon Hardware Division
            </div>
        </div>
    );
};
