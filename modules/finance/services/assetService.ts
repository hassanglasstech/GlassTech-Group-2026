import { SyncService } from '@/src/services/SyncService';

const ASSET_KEY = 'gtk_erp_assets';

const safeParse = (key: string): any[] => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return [];
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

export const AssetService = {
  getAssets: (company?: string) => {
    const all = safeParse(ASSET_KEY);
    return company ? all.filter((a: any) => a.company === company) : all;
  },

  saveAssets: (data: any[]) => {
    // Get all assets from other companies
    const all = safeParse(ASSET_KEY);
    const companies = [...new Set(data.map((a: any) => a.company))];
    const others = all.filter((a: any) => !companies.includes(a.company));
    localStorage.setItem(ASSET_KEY, JSON.stringify([...others, ...data]));
    SyncService.markDirty('assets');
  },

  addAsset: (asset: any) => {
    const all = safeParse(ASSET_KEY);
    all.push({ ...asset, updatedAt: new Date().toISOString() });
    localStorage.setItem(ASSET_KEY, JSON.stringify(all));
    SyncService.markDirty('assets');
  },

  updateAsset: (id: string, updates: any) => {
    const all = safeParse(ASSET_KEY);
    const idx = all.findIndex((a: any) => a.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem(ASSET_KEY, JSON.stringify(all));
      SyncService.markDirty('assets');
    }
  },

  deleteAsset: (id: string) => {
    const all = safeParse(ASSET_KEY).filter((a: any) => a.id !== id);
    localStorage.setItem(ASSET_KEY, JSON.stringify(all));
    SyncService.markDirty('assets');
  },

  addMaintenanceLog: (assetId: string, log: any) => {
    const all = safeParse(ASSET_KEY);
    const idx = all.findIndex((a: any) => a.id === assetId);
    if (idx !== -1) {
      all[idx].maintenanceLogs = [...(all[idx].maintenanceLogs || []), log];
      all[idx].updatedAt = new Date().toISOString();
      localStorage.setItem(ASSET_KEY, JSON.stringify(all));
      SyncService.markDirty('assets');
    }
  },
};
