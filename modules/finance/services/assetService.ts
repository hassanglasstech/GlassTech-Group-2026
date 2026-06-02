/**
 * assetService.ts — Phase 2 Migration
 * SUPABASE-PRIMARY. localStorage = offline fallback only.
 */

import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';

const ASSET_KEY = 'gtk_erp_assets';

const getLocal  = (): any[] => { try { const d = localStorage.getItem(ASSET_KEY); return d ? JSON.parse(d) : []; } catch { return []; } };
const saveLocal = (d: any[]) => { try { localStorage.setItem(ASSET_KEY, JSON.stringify(d)); } catch {} };

export const AssetService = {

  getAssets: async (company?: string): Promise<any[]> => {
    try {
      let q = supabase.from('assets').select('*').order('created_at', { ascending: false });
      if (company) q = q.eq('company', company);
      const { data, error } = await q;
      if (error || !data) {
        const local = getLocal();
        return company ? local.filter((a: any) => a.company === company) : local;
      }
      const mapped = data.map((r: any) => ({ ...r.data, id: r.id, company: r.company }));
      saveLocal(mapped);
      return mapped;
    } catch {
      const local = getLocal();
      return company ? local.filter((a: any) => a.company === company) : local;
    }
  },

  addAsset: async (asset: any): Promise<any> => {
    const entry = { ...asset, updatedAt: new Date().toISOString(), createdAt: asset.createdAt || new Date().toISOString() };
    try {
      const { error } = await supabase.from('assets').upsert([{
        id: entry.id, company: entry.company,
        data: entry, updated_at: new Date().toISOString(),
      }], { onConflict: 'id' });
      if (error) Logger.warn('AssetService', 'Supabase addAsset failed', error);
    } catch (e) {
      Logger.warn('AssetService', 'Supabase unavailable', e);
    }
    // Always keep local cache in sync
    const local = getLocal();
    local.push(entry);
    saveLocal(local);
    return entry;
  },

  updateAsset: async (id: string, updates: any): Promise<void> => {
    const local = getLocal();
    const idx = local.findIndex((a: any) => a.id === id);
    if (idx === -1) return;
    local[idx] = { ...local[idx], ...updates, updatedAt: new Date().toISOString() };
    saveLocal(local);
    try {
      await supabase.from('assets').upsert([{
        id, company: local[idx].company,
        data: local[idx], updated_at: new Date().toISOString(),
      }], { onConflict: 'id' });
    } catch (e) {
      Logger.warn('AssetService', 'Supabase updateAsset failed', e);
    }
  },

  deleteAsset: async (id: string): Promise<void> => {
    const local = getLocal().filter((a: any) => a.id !== id);
    saveLocal(local);
    try {
      await supabase.from('assets').delete().eq('id', id);
    } catch (e) {
      Logger.warn('AssetService', 'Supabase deleteAsset failed', e);
    }
  },

  addMaintenanceLog: async (assetId: string, log: any): Promise<void> => {
    const local = getLocal();
    const idx = local.findIndex((a: any) => a.id === assetId);
    if (idx === -1) return;
    local[idx].maintenanceLogs = [...(local[idx].maintenanceLogs || []), log];
    local[idx].updatedAt = new Date().toISOString();
    saveLocal(local);
    try {
      await supabase.from('assets').upsert([{
        id: assetId, company: local[idx].company,
        data: local[idx], updated_at: new Date().toISOString(),
      }], { onConflict: 'id' });
    } catch (e) {
      Logger.warn('AssetService', 'Supabase maintenance log failed', e);
    }
  },

  // Sync local cache → Supabase (call on app startup if needed)
  syncToSupabase: async (): Promise<void> => {
    const local = getLocal();
    if (!local.length) return;
    try {
      const rows = local.map((a: any) => ({
        id: a.id, company: a.company || 'GTK',
        data: a, updated_at: new Date().toISOString(),
      }));
      await supabase.from('assets').upsert(rows, { onConflict: 'id' });
      Logger.info('AssetService', `Synced ${rows.length} assets to Supabase`);
    } catch (e) {
      Logger.warn('AssetService', 'Bulk sync failed', e);
    }
  },
};
