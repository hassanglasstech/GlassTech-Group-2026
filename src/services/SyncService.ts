import { supabase } from './supabaseClient';
import { safeParse } from '@/modules/shared/services/utils';
import { toast } from 'sonner';

const KEYS = {
  PRODUCTS: 'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  STORE: 'gtk_erp_store',
};

export const SyncService = {
  syncAll: async () => {
    try {
      console.log("Starting sync to Supabase...");
      toast.info("Syncing to Cloud...");

      // 1. Sync Products
      const products = safeParse(KEYS.PRODUCTS);
      console.log("Syncing Products:", products);
      const { error: productError } = await supabase.from('products').upsert(products);
      if (productError) {
        console.error("Supabase Product Error:", productError);
        throw productError;
      }

      // 2. Sync Quotations
      const quotations = safeParse(KEYS.QUOTATIONS);
      console.log("Syncing Quotations:", quotations);
      const { error: quoteError } = await supabase.from('quotations').upsert(quotations.map(q => ({
        id: q.id,
        company: q.company,
        date: q.date,
        client_id: q.clientId,
        project_name: q.projectName,
        subject: q.subject,
        items: q.items,
        service_charges: q.serviceCharges,
        discount_percent: q.discountPercent,
        status: q.status
      })));
      if (quoteError) {
        console.error("Supabase Quotation Error:", quoteError);
        throw quoteError;
      }

      // 3. Sync Store Items
      const storeItems = safeParse(KEYS.STORE);
      console.log("Syncing Store Items:", storeItems);
      const { error: storeError } = await supabase.from('store_items').upsert(storeItems.map(s => ({
        id: s.id,
        company: s.company,
        name: s.name,
        category: s.category,
        quantity: s.quantity,
        unit: s.unit,
        min_level: s.minLevel,
        moving_average_price: s.movingAveragePrice
      })));
      if (storeError) {
        console.error("Supabase Store Item Error:", storeError);
        throw storeError;
      }

      console.log("Sync completed successfully!");
      toast.success("Data Synced Successfully!");
      return { success: true };
    } catch (error: any) {
      console.error("Sync failed:", error);
      toast.error(`Sync Failed: ${error.message || 'Unknown error'}`);
      return { success: false, error };
    }
  },
  fetchFromCloud: async () => {
    try {
      console.log("Fetching from Supabase...");
      
      // 1. Products
      const { data: products, error: productError } = await supabase.from('products').select('*');
      if (productError) throw productError;
      if (products) localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));

      // 2. Quotations
      const { data: quotations, error: quoteError } = await supabase.from('quotations').select('*');
      if (quoteError) throw quoteError;
      if (quotations) localStorage.setItem(KEYS.QUOTATIONS, JSON.stringify(quotations));

      // 3. Store items
      const { data: storeItems, error: storeError } = await supabase.from('store_items').select('*');
      if (storeError) throw storeError;
      if (storeItems) localStorage.setItem(KEYS.STORE, JSON.stringify(storeItems));

      console.log("Data fetched from Cloud!");
      return { success: true };
    } catch (error: any) {
      console.error("Fetch failed:", error);
      toast.error(`Fetch Failed: ${error.message || 'Unknown error'}`);
      return { success: false };
    }
  }
};
