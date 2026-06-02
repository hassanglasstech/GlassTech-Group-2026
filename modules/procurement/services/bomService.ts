/**
 * bomService.ts — Phase 6 (6.1)
 *
 * Thin client for the existing `bom_templates` and `bom_items` tables
 * (created in migration 019). The schema was deployed in Phase 9 of the
 * original build but never had a UI — Phase 6 wires CRUD on top.
 *
 * BOM template = a parent SKU / product (e.g. "6mm Clear Float — Standard
 *                Sheet"). Has a yield% and standard sheet size.
 * BOM item     = a raw material / sub-component line under a template
 *                (qty per finished unit + wastage %).
 *
 * Used by the BOM Master UI to maintain the explosion source for any
 * future MRP enhancement that wants component-level (rather than
 * thickness-only) requirements planning.
 */

import { supabase } from '../../../src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

export interface BomTemplate {
  id?:           string;
  company:       string;
  productCode:   string;
  description:   string;
  glassType?:    string;
  thicknessMm?:  number;
  sheetSizeW?:   number;
  sheetSizeH?:   number;
  uom?:          string;
  yieldPct?:     number;
  isActive?:     boolean;
  notes?:        string;
}

export interface BomItem {
  id?:             string;
  bomTemplateId:   string;
  company:         string;
  lineNo?:         number;
  materialId?:     string;
  materialDesc:    string;
  category?:       string;
  qtyPerUnit:      number;
  uom?:            string;
  wastagePct?:     number;
  isOptional?:     boolean;
  notes?:          string;
}

const _company = () => useAuthStore.getState().profile?.company ?? 'Glassco';

const _toTpl = (r: any): BomTemplate => ({
  id: r.id, company: r.company, productCode: r.product_code,
  description: r.description, glassType: r.glass_type,
  thicknessMm: Number(r.thickness_mm || 0),
  sheetSizeW: Number(r.sheet_size_w || 0),
  sheetSizeH: Number(r.sheet_size_h || 0),
  uom: r.uom, yieldPct: Number(r.yield_pct || 100),
  isActive: r.is_active !== false, notes: r.notes,
});
const _toItem = (r: any): BomItem => ({
  id: r.id, bomTemplateId: r.bom_template_id, company: r.company,
  lineNo: r.line_no, materialId: r.material_id, materialDesc: r.material_desc,
  category: r.category, qtyPerUnit: Number(r.qty_per_unit || 0),
  uom: r.uom, wastagePct: Number(r.wastage_pct || 0),
  isOptional: !!r.is_optional, notes: r.notes,
});

export const BomService = {
  listTemplates: async (): Promise<BomTemplate[]> => {
    const co = _company();
    try {
      const { data, error } = await supabase.from('bom_templates').select('*').eq('company', co);
      if (error || !data) return [];
      return data.map(_toTpl);
    } catch { return []; }
  },

  listItemsForTemplate: async (templateId: string): Promise<BomItem[]> => {
    try {
      const { data, error } = await supabase
        .from('bom_items').select('*')
        .eq('bom_template_id', templateId)
        .order('line_no', { ascending: true });
      if (error || !data) return [];
      return data.map(_toItem);
    } catch { return []; }
  },

  upsertTemplate: async (t: BomTemplate): Promise<{ id: string } | null> => {
    const id = t.id || `BOM-${_company().substring(0, 3).toUpperCase()}-${Date.now()}`;
    const row = {
      id,
      company: t.company,
      product_code: t.productCode,
      description:  t.description,
      glass_type:   t.glassType || null,
      thickness_mm: t.thicknessMm || null,
      sheet_size_w: t.sheetSizeW || null,
      sheet_size_h: t.sheetSizeH || null,
      uom:          t.uom || 'SqFt',
      yield_pct:    Number(t.yieldPct ?? 100),
      is_active:    t.isActive !== false,
      notes:        t.notes || null,
      updated_at:   new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('bom_templates').upsert(row, { onConflict: 'id' });
      if (error) { console.error('[BomService] upsertTemplate', error.message); return null; }
      return { id };
    } catch (e: any) { console.error('[BomService] upsertTemplate', e?.message); return null; }
  },

  upsertItem: async (item: BomItem): Promise<{ id: string } | null> => {
    const id = item.id || `BOMITM-${_company().substring(0, 3).toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const row = {
      id,
      bom_template_id: item.bomTemplateId,
      company:         item.company,
      line_no:         item.lineNo ?? 1,
      material_id:     item.materialId || null,
      material_desc:   item.materialDesc,
      category:        item.category || null,
      qty_per_unit:    Number(item.qtyPerUnit || 0),
      uom:             item.uom || 'Nos',
      wastage_pct:     Number(item.wastagePct || 0),
      is_optional:     !!item.isOptional,
      notes:           item.notes || null,
      updated_at:      new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('bom_items').upsert(row, { onConflict: 'id' });
      if (error) { console.error('[BomService] upsertItem', error.message); return null; }
      return { id };
    } catch (e: any) { console.error('[BomService] upsertItem', e?.message); return null; }
  },

  deleteTemplate: async (id: string): Promise<boolean> => {
    try {
      // Items cascade via FK ON DELETE CASCADE
      const { error } = await supabase.from('bom_templates').delete().eq('id', id);
      if (error) { console.error('[BomService] deleteTemplate', error.message); return false; }
      return true;
    } catch { return false; }
  },

  deleteItem: async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('bom_items').delete().eq('id', id);
      if (error) { console.error('[BomService] deleteItem', error.message); return false; }
      return true;
    } catch { return false; }
  },
};
