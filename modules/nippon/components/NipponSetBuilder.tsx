import React, { useMemo, useState } from 'react';
import { Product, ProductComponent } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { componentsValue, setsOf } from '@/modules/nippon/utils/productSets';
import { withoutVariantParents } from '@/modules/nippon/utils/variantGrouping';
import { Boxes, Plus, Search, Trash2, Edit2, X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  products: Product[];
  /** Refresh the master list after a set is saved or deleted. */
  onChanged: () => Promise<void> | void;
}

const BLANK = { code: '', name: '', unit: 'Set', price: '' };

/**
 * Set Builder — assemble several catalogue items into one sellable bundle.
 *
 * A set is stored as an ordinary product with `isSet` + `setComponents`, so it
 * needs no new table and flows through search, pricing, stock and printing like
 * any other item. What makes it a set is only that it carries its contents.
 */
const NipponSetBuilder: React.FC<Props> = ({ products, onChanged }) => {
  const company = 'Nippon';
  const [editingId, setEditingId] = useState<string | null>(null);   // null = list view
  const [form, setForm] = useState(BLANK);
  const [components, setComponents] = useState<ProductComponent[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const sets = useMemo(() => setsOf(products), [products]);

  // Sets are built FROM ordinary items, so the picker hides other sets (a set of
  // sets has no meaning here) and variant parents (a grouping row is not stock).
  const pickable = useMemo(() => withoutVariantParents(products).filter(p => !p.isSet), [products]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(components.map(c => c.productId).filter(Boolean));
    return pickable
      .filter(p => !chosen.has(p.id))
      .filter(p => [p.description, p.name, p.modelNo, p.itemCode, p.profileCode, p.brand]
        .filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, pickable, components]);

  const looseValue = componentsValue(components);
  const priceNum = Number(form.price) || 0;
  // How the bundle is positioned: below the loose total is a bundle discount,
  // above it is a premium. Worth showing while pricing, never printed.
  const delta = priceNum && looseValue ? priceNum - looseValue : 0;

  const resetForm = () => { setForm(BLANK); setComponents([]); setSearch(''); setEditingId(null); };

  const startNew = () => { resetForm(); setEditingId('new'); };

  const startEdit = (s: Product) => {
    setForm({
      code: s.profileCode || s.modelNo || s.id,
      name: s.description || '',
      unit: s.unit || 'Set',
      price: String(s.basePrice ?? s.price ?? ''),
    });
    setComponents(s.setComponents || []);
    setSearch('');
    setEditingId(s.id);
  };

  const addComponent = (p: Product) => {
    setComponents(prev => [...prev, {
      id: `COMP-${p.id}`,
      productId: p.id,
      code: p.modelNo || p.itemCode || p.profileCode || p.id,
      description: p.description || p.name || p.id,
      unit: p.unit || 'PCS',
      qtyPerSet: 1,
      rate: p.price || p.basePrice || 0,
    }]);
    setSearch('');
  };

  const setQty = (idx: number, qty: number) => {
    setComponents(prev => prev.map((c, i) => (i === idx ? { ...c, qtyPerSet: qty } : c)));
  };

  const removeComponent = (idx: number) => {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!code) { toast.error('Set code is required.'); return; }
    if (!name) { toast.error('Set name is required.'); return; }
    if (!components.length) { toast.error('A set needs at least one item — search and add the contents.'); return; }
    const badQty = components.find(c => !(Number(c.qtyPerSet) > 0));
    if (badQty) { toast.error(`Quantity must be more than 0 — check "${badQty.description}".`); return; }
    if (priceNum <= 0) { toast.error('Set price is required — a bundle is sold at one price.'); return; }

    const isNew = editingId === 'new';
    const id = isNew ? code : (editingId as string);
    if (isNew && products.some(p => p.id === id || (p.profileCode || '').toUpperCase() === code)) {
      toast.error(`"${code}" already exists — pick another set code.`); return;
    }

    const existing = products.find(p => p.id === id);
    const set: Product = {
      ...(existing as Product | undefined),
      id,
      company,
      category: 'Hardware',
      mainCategory: existing?.mainCategory || 'Sets',
      subCategory: existing?.subCategory || '',
      description: name.toUpperCase(),
      profileCode: code,
      unit: form.unit,
      basePrice: priceNum,
      // Cost rolls up from the components' own cost — a bundle has no cost of
      // its own, and leaving it at 0 would show the whole set as pure margin.
      costPrice: components.reduce((sum, c) => {
        const src = products.find(p => p.id === c.productId);
        return sum + (Number(src?.costPrice) || 0) * (Number(c.qtyPerSet) || 0);
      }, 0),
      isSet: true,
      setComponents: components,
      variants: existing?.variants || [],
    } as Product;

    setSaving(true);
    try {
      const res = await AsyncSalesService.saveProducts([set]);
      // Deliberately NO store row for the set. A set is not stocked as a unit —
      // it is assembled from loose hardware when the order is issued, so its
      // availability IS its components' availability. A phantom set row would
      // sit at zero forever and double-count the same hardware in stock value.
      await onChanged();
      if (res.error) return;   // saveProducts already surfaced the cloud failure
      toast.success(isNew ? `Set created: ${set.description}` : `Set updated: ${set.description}`);
      resetForm();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error)?.message || 'unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Product) => {
    const ok = await confirmModal(
      `Delete the set "${s.description}"?\n\nOnly the bundle is removed — the ${s.setComponents?.length || 0} item(s) inside it stay in the catalogue.`,
    );
    if (!ok) return;
    const { error } = await AsyncSalesService.deleteProduct(s.id);
    if (error) { toast.error(`Delete failed — set still in cloud: ${error}`); return; }
    await InventoryService.deleteStoreItems([s.id]);
    await onChanged();
    toast.success('Set deleted.');
  };

  // ── List view ────────────────────────────────────────────────────────
  if (!editingId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Product Sets</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Bundle several items into one sellable unit. On a quotation the customer sees what is inside and
              how many of each — but one price.
            </p>
          </div>
          <button onClick={startNew}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> New Set
          </button>
        </div>

        {sets.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl py-14 text-center">
            <Boxes size={30} className="mx-auto text-slate-300" />
            <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-400">No sets yet</p>
            <p className="mt-1 text-[11px] text-slate-400">Create one to sell a handle, lock and hinges together at a single price.</p>
          </div>
        ) : (
          <table className="w-full text-left sap-table sap-table-dense">
            <thead>
              <tr>
                <th className="w-32">Set Code</th>
                <th>Set Name</th>
                <th className="w-20 text-center">Items</th>
                <th className="w-20 text-center">Unit</th>
                <th className="w-28 text-right">Loose Value</th>
                <th className="w-28 text-right">Set Price</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y text-xs font-medium">
              {sets.map(s => {
                const loose = componentsValue(s.setComponents || []);
                const price = s.basePrice ?? s.price ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-amber-50/40">
                    <td className="font-mono font-bold text-amber-700 uppercase">{s.profileCode || s.id}</td>
                    <td>
                      <div className="font-bold text-slate-800 uppercase">{s.description}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[420px]">
                        {(s.setComponents || []).map(c => `${c.qtyPerSet}× ${c.description}`).join('  ·  ')}
                      </div>
                    </td>
                    <td className="text-center font-black text-slate-600">{s.setComponents?.length || 0}</td>
                    <td className="text-center uppercase text-slate-500 font-bold text-[10px]">{s.unit}</td>
                    <td className="text-right tabular-nums text-slate-400">{loose ? loose.toLocaleString() : '—'}</td>
                    <td className="text-right tabular-nums font-black text-slate-900">{price.toLocaleString()}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(s)} title="Edit set"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(s)} title="Delete set"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── Editor ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
          {editingId === 'new' ? 'New Set' : `Edit Set — ${form.code}`}
        </h3>
        <button onClick={resetForm} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700">
          <X size={13} /> Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Set Code</span>
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
            readOnly={editingId !== 'new'}
            placeholder="e.g. SET-DOOR-01"
            className="sap-input w-full mt-1 text-xs font-mono font-bold uppercase read-only:bg-slate-50 read-only:text-slate-400" />
        </label>
        <label className="block md:col-span-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Set Name</span>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Sliding Door Complete Kit"
            className="sap-input w-full mt-1 text-xs font-bold uppercase" />
        </label>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Unit</span>
          <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
            className="sap-input w-full mt-1 text-xs font-bold uppercase">
            {['Set', 'PCS', 'Pair', 'Box', 'Pkt'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>

      {/* ── Contents ── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">What's inside this set</span>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search an item by name or code, then click to add…"
              className="sap-input w-full pl-9 text-xs font-medium" />
            {matches.length > 0 && (
              <div className="absolute z-40 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[280px] overflow-y-auto">
                {matches.map(p => (
                  <div key={p.id} onClick={() => addComponent(p)}
                    className="px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-0">
                    <div className="font-bold text-slate-800 uppercase text-xs truncate">{p.description || p.name}</div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {p.modelNo || p.itemCode || p.profileCode || p.id}
                      {' · '}{(p.price || p.basePrice || 0).toLocaleString()} / {p.unit || 'PCS'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {search.trim() && matches.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-400 font-medium">No item matches "{search}".</p>
            )}
          </div>

          {components.length === 0 ? (
            <p className="text-[11px] text-slate-400 font-medium py-3">Nothing added yet — search above to put items in this set.</p>
          ) : (
            <table className="w-full text-left sap-table sap-table-dense">
              <thead>
                <tr>
                  <th className="w-32">Code</th>
                  <th>Item</th>
                  <th className="w-20 text-center">Unit</th>
                  <th className="w-24 text-center">Qty / Set</th>
                  <th className="w-28 text-right">Loose Value</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs font-medium">
                {components.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="font-mono font-bold text-blue-600 uppercase">{c.code || '—'}</td>
                    <td className="font-bold text-slate-700 uppercase">{c.description}</td>
                    <td className="text-center uppercase text-slate-500 font-bold text-[10px]">{c.unit}</td>
                    <td className="text-center">
                      <input type="number" min={1} value={c.qtyPerSet || ''}
                        onChange={e => setQty(idx, Number(e.target.value))}
                        className="sap-input w-16 text-center text-xs font-black tabular-nums" />
                    </td>
                    <td className="text-right tabular-nums text-slate-400">
                      {((Number(c.rate) || 0) * (Number(c.qtyPerSet) || 0)).toLocaleString()}
                    </td>
                    <td>
                      <button onClick={() => removeComponent(idx)} title="Remove from set"
                        className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Price ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4">
        <div className="text-[11px] font-medium text-slate-500 space-y-0.5">
          <div>
            Sold loose, these items total{' '}
            <span className="font-black tabular-nums text-slate-700">{looseValue.toLocaleString()}</span>
          </div>
          {delta !== 0 && (
            <div className={delta < 0 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
              {delta < 0
                ? `Bundle discount of ${Math.abs(delta).toLocaleString()}`
                : `Bundle premium of ${delta.toLocaleString()}`}
            </div>
          )}
        </div>

        <div className="flex items-end gap-3">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Set Price</span>
            <div className="flex items-center gap-2 mt-1">
              <input type="number" min={0} value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
                placeholder="0"
                className="sap-input w-36 text-right text-sm font-black tabular-nums" />
              {looseValue > 0 && (
                <button type="button" onClick={() => setForm({ ...form, price: String(looseValue) })}
                  className="text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-800 whitespace-nowrap">
                  Use {looseValue.toLocaleString()}
                </button>
              )}
            </div>
          </label>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-lg transition-colors">
            <Save size={14} /> {saving ? 'Saving…' : editingId === 'new' ? 'Create Set' : 'Save Set'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NipponSetBuilder;
