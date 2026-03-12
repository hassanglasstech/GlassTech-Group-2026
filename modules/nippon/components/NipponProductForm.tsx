import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; // Apna supabase client path check kar lein
import { toast } from 'sonner';
import { Search, Loader2, Package, Image as ImageIcon } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  item_code: string;
  material: string;
  image_url: string;
  created_at: string;
}

const NipponProductForm = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. REFRESH PAR DATA LOAD KARNA (useEffect)
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
      toast.error('Error loading products: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. SEARCH BY NAME AND ITEM CODE
  const filteredProducts = products.filter((p) => {
    const term = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) || 
      p.item_code.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Search Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by Product Name or Item Code..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-slate-400">Total Items</p>
          <p className="text-xl font-black text-blue-600">{filteredProducts.length}</p>
        </div>
      </div>

      {/* Product List */}
      {loading ? (
        <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group">
              {/* 3. IMAGE DISPLAY WITH PUBLIC URL LOGIC */}
              <div className="h-48 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="flex flex-col items-center text-slate-300">
                    <ImageIcon size={48} />
                    <span className="text-[10px] font-bold mt-2 uppercase">No Image Available</span>
                  </div>
                )}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm">
                  {product.item_code}
                </div>
              </div>

              <div className="p-5">
                <h3 className="font-black text-slate-800 uppercase text-lg leading-tight mb-1">{product.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Material: {product.material}</p>
                <button className="w-full py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 transition-colors">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {filteredProducts.length === 0 && !loading && (
        <div className="text-center py-20 border-2 border-dashed rounded-3xl">
          <Package className="mx-auto text-slate-200 mb-4" size={60} />
          <p className="text-slate-400 font-bold uppercase">No products found matching your search.</p>
        </div>
      )}
    </div>
  );
};

export default NipponProductForm;
