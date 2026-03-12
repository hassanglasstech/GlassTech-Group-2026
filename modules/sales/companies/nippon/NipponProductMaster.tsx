import React, { useState, useEffect } from 'react';
// PATH FIX: Ab ye sahi folder 'services' se pick karega
import { supabase } from '@/services/supabaseClient'; 
import { Search, Package, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  item_code: string;
  material: string;
  image_url: string;
  created_at: string;
}

const NipponProductMaster = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // REFRESH FIX: Database se data fetch karne ka logic
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setProducts(data);
    } catch (error: any) {
      console.error('Fetch Error:', error);
      toast.error('Data load nahi ho saka: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // SEARCH FIX: Name aur Item Code dono se search karega
  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) || 
      (p.item_code && p.item_code.toLowerCase().includes(term))
    );
  });

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* Search & Header Section */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase text-slate-800 tracking-tight">Nippon Product Master</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hardware Inventory Management</p>
        </div>
        
        <div className="relative w-full max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search Name or Item Code..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-blue-50 px-6 py-2 rounded-2xl border border-blue-100 text-center min-w-[120px]">
          <p className="text-[9px] font-black uppercase text-blue-400">Items Count</p>
          <p className="text-xl font-black text-blue-700">{filteredProducts.length}</p>
        </div>
      </div>

      {/* Product Display Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-xs font-black uppercase text-slate-400 tracking-widest text-center">
            Fetching Hardware Data...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden hover:shadow-xl transition-all group">
              <div className="h-52 bg-slate-50 relative flex items-center justify-center overflow-hidden border-b">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                ) : (
                  <div className="flex flex-col items-center text-slate-200">
                    <ImageIcon size={64} strokeWidth={1} />
                    <span className="text-[9px] font-black mt-2 uppercase tracking-tighter">No Preview</span>
                  </div>
                )}
                
                <div className="absolute top-4 left-4 bg-slate-900 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-lg">
                  {product.item_code || 'TBD'}
                </div>
              </div>

              <div className="p-6">
                <h3 className="font-black text-slate-800 uppercase text-lg leading-tight group-hover:text-blue-600 transition-colors">
                  {product.name}
                </h3>
                <p className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Material: <span className="text-slate-600">{product.material || 'N/A'}</span>
                </p>
                <div className="mt-6 pt-4 border-t">
                  <button className="w-full py-3 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                    View Specs
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* If No Data Found */}
      {!loading && filteredProducts.length === 0 && (
        <div className="bg-white py-24 text-center rounded-[3rem] border-2 border-dashed border-slate-200">
          <Package className="mx-auto text-slate-100 mb-6" size={80} />
          <h4 className="text-slate-400 font-black uppercase tracking-widest">Hardware not found</h4>
          <p className="text-slate-300 text-[10px] font-bold mt-2 uppercase">Check your spelling or part code</p>
        </div>
      )}
    </div>
  );
};

export default NipponProductMaster;
