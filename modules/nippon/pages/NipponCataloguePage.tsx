import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { SalesService } from '@/modules/sales/services/salesService';
import { Product } from '@/modules/shared/types';
import { ProductImage } from '@/modules/shared/components/ProductImage';
import {
  Printer, Filter, FileText, Search, Image as ImageIcon,
  Building2,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════════════
// NIPPON CATALOGUE PAGE
//
// Hassan's spec:
//   • Cat / sub-cat wise items with images
//   • PDF export (uses browser print → "Save as PDF")
//   • 3 branding options:
//       - Glasstech (parent group)
//       - Kin Long  (primary supplier)
//       - General   (generic, no brand)
//
// Wired in App.tsx as /#/nippon/catalogue (Nippon company only).
// ════════════════════════════════════════════════════════════════════

type Brand = 'glasstech' | 'kinlong' | 'general';

const BRANDS: Record<Brand, {
  label:     string;
  title:     string;
  subtitle:  string;
  accent:    string;    // tailwind color class for accent line
  primary:   string;    // hex for inline print color
  tagline:   string;
  footer:    string;
}> = {
  glasstech: {
    label:    'Glasstech',
    title:    'GlassTech Group',
    subtitle: 'Premium Hardware & Architectural Solutions',
    accent:   'bg-blue-600',
    primary:  '#1A3A6B',
    tagline:  'A Trusted Name in Glass & Aluminium since 1985',
    footer:   '© 2026 GlassTech Group · Karachi, Pakistan',
  },
  kinlong: {
    label:    'Kin Long',
    title:    'KIN LONG Hardware',
    subtitle: 'Authorized Distributor — Pakistan',
    accent:   'bg-red-600',
    primary:  '#C8102E',
    tagline:  'World-Class Window & Door Hardware Solutions',
    footer:   '© 2026 KIN LONG · Distributed by Nippon Hardware',
  },
  general: {
    label:    'General',
    title:    'Product Catalogue',
    subtitle: 'Hardware & Accessories',
    accent:   'bg-slate-700',
    primary:  '#1f2937',
    tagline:  '',
    footer:   '© 2026',
  },
};

const NipponCataloguePage: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [brand, setBrand] = useState<Brand>('glasstech');
  const [mainFilter, setMainFilter] = useState('All');
  const [subFilter, setSubFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyWithImage, setShowOnlyWithImage] = useState(false);

  const products = useMemo(
    () => SalesService.getProducts().filter(p => p.company === 'Nippon'),
    [company]
  );

  // Category tree from real data
  const categoryTree = useMemo(() => {
    const tree = new Map<string, Set<string>>();
    for (const p of products) {
      const main = p.mainCategory?.trim();
      const sub  = p.subCategory?.trim();
      if (!main) continue;
      if (!tree.has(main)) tree.set(main, new Set());
      if (sub) tree.get(main)!.add(sub);
    }
    const MAIN_ORDER = [
      'Window Hardware', 'Door Hardware', 'Sliding Hardware',
      'Profile & Frame Hardware', 'Silicon & Sealants',
      'Mesh & Screens', 'Fasteners & Consumables',
    ];
    const ordered = new Map<string, string[]>();
    for (const m of MAIN_ORDER) if (tree.has(m)) ordered.set(m, [...tree.get(m)!].sort());
    for (const [m, subs] of tree) if (!ordered.has(m)) ordered.set(m, [...subs].sort());
    return ordered;
  }, [products]);

  const availableSubs = useMemo(() => {
    if (mainFilter === 'All') return [];
    return categoryTree.get(mainFilter) || [];
  }, [mainFilter, categoryTree]);

  // Reset sub when main changes
  React.useEffect(() => { setSubFilter('All'); }, [mainFilter]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter(p => {
      if (mainFilter !== 'All' && p.mainCategory !== mainFilter) return false;
      if (subFilter  !== 'All' && p.subCategory  !== subFilter)  return false;
      if (showOnlyWithImage && !p.imageUrl) return false;
      if (q && !((p.description || '').toLowerCase().includes(q) ||
                 (p.modelNo     || '').toLowerCase().includes(q) ||
                 (p.profileCode || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [products, mainFilter, subFilter, searchTerm, showOnlyWithImage]);

  // Group filtered products by main → sub for the catalogue render
  const grouped = useMemo(() => {
    const tree: Record<string, Record<string, Product[]>> = {};
    for (const p of filtered) {
      const main = p.mainCategory?.trim() || 'Uncategorized';
      const sub  = p.subCategory?.trim()  || 'General';
      if (!tree[main]) tree[main] = {};
      if (!tree[main][sub]) tree[main][sub] = [];
      tree[main][sub].push(p);
    }
    const MAIN_ORDER = [
      'Window Hardware', 'Door Hardware', 'Sliding Hardware',
      'Profile & Frame Hardware', 'Silicon & Sealants',
      'Mesh & Screens', 'Fasteners & Consumables',
    ];
    const orderedMains = [
      ...MAIN_ORDER.filter(m => m in tree),
      ...Object.keys(tree).filter(m => !MAIN_ORDER.includes(m)).sort(),
    ];
    return orderedMains.map(main => ({
      main,
      subs: Object.entries(tree[main]).sort(([a], [b]) => a.localeCompare(b)),
      total: Object.values(tree[main]).flat().length,
    }));
  }, [filtered]);

  const handlePrint = () => window.print();
  const brandCfg = BRANDS[brand];

  if (company !== 'Nippon') {
    return (
      <div className="text-center py-20 text-slate-400 text-sm">
        Catalogue sirf Nippon company ke liye available hai. Sidebar se Nippon select karen.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Toolbar (hidden in print) ────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 tracking-tight">Product Catalogue</h2>
              <p className="text-[11px] text-slate-500">{filtered.length} products · cat/sub-cat wise</p>
            </div>
          </div>
          <button onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm">
            <Printer size={14}/> Print / Save as PDF
          </button>
        </div>

        {/* Brand selector */}
        <div>
          <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block mb-2">
            Branding
          </label>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(BRANDS) as Brand[]).map(b => (
              <button key={b} onClick={() => setBrand(b)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all ${brand === b ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                <Building2 size={13}/> {BRANDS[b].label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name / model / code..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
            <select value={mainFilter} onChange={e => setMainFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs font-bold uppercase outline-none cursor-pointer">
              <option value="All">All Categories</option>
              {[...categoryTree.keys()].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {mainFilter !== 'All' && availableSubs.length > 0 && (
            <div>
              <select value={subFilter} onChange={e => setSubFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold uppercase outline-none cursor-pointer">
                <option value="All">All Sub-Types</option>
                {availableSubs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showOnlyWithImage}
            onChange={e => setShowOnlyWithImage(e.target.checked)}
            className="rounded text-blue-600"/>
          Sirf un items dikhao jin ki image hai
        </label>
      </div>

      {/* ── Catalogue body (also the print view) ─────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm catalogue-body">
        {/* Print-specific styles */}
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
            body { margin: 0; }
            .no-print { display: none !important; }
            aside, header, nav { display: none !important; }
            .catalogue-body { border: none !important; box-shadow: none !important; padding: 0 !important; }
            .cat-card { page-break-inside: avoid; break-inside: avoid; }
            .cat-section-header { page-break-after: avoid; }
            .cat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}</style>

        {/* Brand header */}
        <div className="text-center mb-8 pb-6 border-b" style={{borderColor: brandCfg.primary + '33'}}>
          <h1 className="text-3xl font-black uppercase tracking-tight" style={{color: brandCfg.primary}}>
            {brandCfg.title}
          </h1>
          <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mt-1">
            {brandCfg.subtitle}
          </p>
          {brandCfg.tagline && (
            <p className="text-[11px] italic text-slate-400 mt-2">{brandCfg.tagline}</p>
          )}
          <div className={`w-24 h-1 mx-auto mt-3 ${brandCfg.accent}`}></div>
        </div>

        {/* Sections */}
        {grouped.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            Filter ke mutabiq koi product nahi mila.
          </div>
        ) : (
          grouped.map(g => (
            <section key={g.main} className="mb-10">
              {/* Main category banner */}
              <div className="cat-section-header mb-4 flex items-center gap-3">
                <div className="w-1 h-8" style={{background: brandCfg.primary}}></div>
                <div className="flex-1">
                  <h2 className="text-lg font-black uppercase tracking-tight" style={{color: brandCfg.primary}}>{g.main}</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{g.total} items</p>
                </div>
              </div>

              {g.subs.map(([sub, subProducts]) => (
                <div key={sub} className="mb-6">
                  {/* Sub-category header */}
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-3 pb-1 border-b border-slate-200">
                    {sub} <span className="text-slate-400">· {subProducts.length}</span>
                  </h3>

                  {/* Products grid */}
                  <div className="cat-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {subProducts.map(p => (
                      <div key={p.id} className="cat-card border border-slate-200 rounded-lg overflow-hidden bg-white">
                        {/* Image */}
                        <div className="aspect-square bg-slate-50 flex items-center justify-center border-b border-slate-100">
                          <ProductImage code={p.modelNo} url={p.imageUrl} alt={p.description} className="w-full h-full object-contain p-2" iconSize={24} />
                        </div>
                        {/* Details */}
                        <div className="p-2.5">
                          <p className="text-[10px] font-black uppercase text-slate-900 leading-tight line-clamp-2 min-h-[28px]">
                            {p.description || p.id}
                          </p>
                          <p className="text-[9px] font-mono text-blue-600 mt-1">{p.modelNo || p.id}</p>
                          {(p.finishColor || p.material) && (
                            <p className="text-[9px] text-slate-500 mt-1">
                              {[p.finishColor, p.material].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {brandCfg.footer}
          </p>
        </div>
      </div>
    </div>
  );
};

export default NipponCataloguePage;
