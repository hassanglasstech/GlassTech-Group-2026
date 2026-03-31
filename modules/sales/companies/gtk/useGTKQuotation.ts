import { useState, useCallback } from 'react';
import {
  DEFAULT_RATE_CARD, GLASS_RATES,
  autoRefNo, autoSubject, validityDate, STANDARD_TERMS,
  RateCard, WINDOW_TYPES,
} from './gtkQuotationConstants';
import { GTKQuoteHeader, GTKQuoteItem, GTKQuoteOption } from './gtkQuotationTypes';
import { WindowTypeId } from './gtkQuotationConstants';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

let _seed = 200;
const uid = () => `${Date.now()}-${++_seed}`;

export const calcItem = (
  item: GTKQuoteItem,
  rates: RateCard,
  mode: 'aluminum' | 'inclusive'
): GTKQuoteItem => {
  const wt = WINDOW_TYPES.find(w => w.id === item.windowTypeId);
  const isRFT = wt?.pricingUnit === 'rft';
  const qty = parseInt(String(item.qty)) || 1;
  // RFT items: widthFt = linear feet, height unused
  const sf1 = isRFT
    ? (parseFloat(String(item.widthFt)) || 0)
    : (parseFloat(String(item.widthFt)) || 0) * (parseFloat(String(item.heightFt)) || 0);
  const totalSqft = sf1 * qty;

  const cardRate = rates[item.profile]?.[item.windowTypeId] ?? 0;
  const effectiveRate = item.rateOverride !== '' ? parseFloat(item.rateOverride) || 0 : cardRate;
  const aluminumAmt = totalSqft * effectiveRate;

  let glassAmt = 0;
  if (mode === 'inclusive' && !isRFT) {
    const gRate = item.glassRateOverride !== ''
      ? parseFloat(item.glassRateOverride) || 0
      : (GLASS_RATES[item.glassSpecId] || 0);
    glassAmt = totalSqft * gRate;
  }

  const nettingRate = item.netting === 'zigzag' ? 85 : item.netting === 'hd_steel' ? 110 : 0;
  const nettingAmt = isRFT ? 0 : totalSqft * nettingRate;

  return { ...item, sqftPerPiece: sf1, totalSqft, effectiveRate, aluminumAmt, glassAmt, nettingAmt, total: aluminumAmt + glassAmt + nettingAmt };
};

const sumOption = (items: GTKQuoteItem[]) => ({
  totalSqft: items.reduce((s, i) => s + i.totalSqft, 0),
  totalAmount: items.reduce((s, i) => s + i.total, 0),
});

// ─── DEFAULTS ────────────────────────────────────────────────────────────────

const makeDefaultHeader = (): GTKQuoteHeader => ({
  refNo: autoRefNo(),
  date: new Date().toISOString().split('T')[0],
  validTill: validityDate(10),
  clientId: '', clientName: '', site: '', architect: '',
  color: 'Black',
  profileType: 'Non-Thermal',
  sectionSize: '4"',
  sectionBrand: 'GT Gulf Series',
  hardware: 'KINLONG',
  subject: '',
  mode: 'aluminum',
  installationIncluded: false,
  discount: 0,
  cartage: 0,
  terms: STANDARD_TERMS,
});

const makeDefaultItem = (profile = '4"'): GTKQuoteItem => ({
  id: uid(),
  serialNo: '', windowTypeId: 'openable_1' as WindowTypeId,
  profile, glassSpecId: 'sg_8_clear', customGlassLabel: '',
  floor: 'Ground Floor', location: '', locationCode: '',
  qty: 1, widthFt: 0, heightFt: 0,
  netting: 'zigzag', dividerNote: '', rateOverride: '',
  glassRateOverride: '', notes: '', coupled: false, coupledWith: '',
  sqftPerPiece: 0, totalSqft: 0, effectiveRate: 0,
  aluminumAmt: 0, glassAmt: 0, nettingAmt: 0, total: 0,
});

const makeOption = (label: string, profileType = 'Non-Thermal', sectionSize = '4"'): GTKQuoteOption => {
  const id = uid();
  return { id, label, profileType, sectionSize, items: [makeDefaultItem(sectionSize)], totalSqft: 0, totalAmount: 0, isActive: true };
};

// ─── HOOK ────────────────────────────────────────────────────────────────────

export const useGTKQuotation = () => {
  const [rates, setRates] = useState<RateCard>(DEFAULT_RATE_CARD);
  const [header, setHeader] = useState<GTKQuoteHeader>(makeDefaultHeader());
  const firstOpt = makeOption('Option A');
  const [options, setOptions] = useState<GTKQuoteOption[]>([firstOpt]);
  const [activeOptionId, setActiveOptionId] = useState<string>(firstOpt.id);
  const [activeView, setActiveView] = useState<'builder' | 'preview_quote' | 'preview_jobs' | 'compare'>('builder');
  const [showRateCard, setShowRateCard] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const activeOption = options.find(o => o.id === activeOptionId) ?? options[0];
  const items = activeOption?.items ?? [];

  // ── Header ────────────────────────────────────────────────────────────────
  const updateHeader = useCallback(<K extends keyof GTKQuoteHeader>(field: K, value: GTKQuoteHeader[K]) => {
    setHeader(prev => {
      const next = { ...prev, [field]: value };
      if (['profileType', 'sectionSize', 'mode'].includes(field as string))
        next.subject = autoSubject(next.profileType, next.sectionSize, next.mode);
      if (field === 'profileType') {
        const brands: Record<string, string> = {
          'Non-Thermal':'GT Gulf Series','Thermal Break':'Imported Thermal',
          'AluWood OAK':'AluWood — OAK','AluWood TEAK':'AluWood — Teak',
          'uPVC White':'SKYPEN uPVC','uPVC Black Lami':'SKYPEN uPVC Black',
        };
        next.sectionBrand = brands[value as string] ?? next.sectionBrand;
      }
      return next;
    });
  }, []);

  // ── Options ───────────────────────────────────────────────────────────────
  const setOptionItems = useCallback((optId: string, newItems: GTKQuoteItem[]) => {
    setOptions(prev => prev.map(o => {
      if (o.id !== optId) return o;
      const upd = { ...o, items: newItems, ...sumOption(newItems) };
      return upd;
    }));
  }, []);

  const addOption = useCallback(() => {
    const labels = ['Option A','Option B','Option C','Option D','Revised-1','Revised-2','Final'];
    const used = options.map(o => o.label);
    const label = labels.find(l => !used.includes(l)) ?? `Option ${options.length + 1}`;
    const opt = makeOption(label, header.profileType, header.sectionSize);
    setOptions(prev => [...prev, opt]);
    setActiveOptionId(opt.id);
  }, [options, header.profileType, header.sectionSize]);

  const removeOption = useCallback((id: string) => {
    if (options.length <= 1) return;
    setOptions(prev => prev.filter(o => o.id !== id));
    if (activeOptionId === id) {
      const remaining = options.filter(o => o.id !== id);
      setActiveOptionId(remaining[0]?.id ?? '');
    }
  }, [options, activeOptionId]);

  const duplicateOption = useCallback((id: string) => {
    const src = options.find(o => o.id === id);
    if (!src) return;
    const dup: GTKQuoteOption = {
      ...src, id: uid(),
      label: `${src.label} (Copy)`,
      items: src.items.map(i => ({ ...i, id: uid() })),
    };
    setOptions(prev => [...prev, dup]);
    setActiveOptionId(dup.id);
  }, [options]);

  const updateOptionLabel = useCallback((id: string, label: string) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, label } : o));
  }, []);

  // ── Items ─────────────────────────────────────────────────────────────────
  const addItem = useCallback(() => {
    const base = makeDefaultItem(activeOption?.sectionSize ?? header.sectionSize);
    const calc = calcItem(base, rates, header.mode);
    setOptionItems(activeOption.id, [...items, calc]);
  }, [activeOption, items, rates, header.mode, header.sectionSize, setOptionItems]);

  const deleteItem = useCallback((id: string) => {
    setOptionItems(activeOption.id, items.filter(i => i.id !== id));
  }, [activeOption, items, setOptionItems]);

  const duplicateItem = useCallback((id: string) => {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const dup = { ...items[idx], id: uid(), serialNo: '' };
    const next = [...items];
    next.splice(idx + 1, 0, dup);
    setOptionItems(activeOption.id, next);
  }, [activeOption, items, setOptionItems]);

  const updateItem = useCallback(<K extends keyof GTKQuoteItem>(id: string, field: K, value: GTKQuoteItem[K]) => {
    const next = items.map(item => {
      if (item.id !== id) return item;
      return calcItem({ ...item, [field]: value }, rates, header.mode);
    });
    setOptionItems(activeOption.id, next);
  }, [activeOption, items, rates, header.mode, setOptionItems]);

  const moveItem = useCallback((id: string, dir: 'up' | 'down') => {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const next = [...items];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setOptionItems(activeOption.id, next);
  }, [activeOption, items, setOptionItems]);

  // ── Rate Card ────────────────────────────────────────────────────────────
  const saveRates = useCallback((newRates: RateCard) => {
    setRates(newRates);
    setOptions(prev => prev.map(o => ({
      ...o,
      items: o.items.map(i => calcItem(i, newRates, header.mode)),
    })));
  }, [header.mode]);

  // ── Totals (active option) ────────────────────────────────────────────────
  const totalSqft   = items.reduce((s, i) => s + i.totalSqft, 0);
  const subTotal    = items.reduce((s, i) => s + i.total, 0);
  const installAmt  = header.installationIncluded ? totalSqft * 120 : 0;
  const grossTotal  = subTotal + installAmt + (header.cartage || 0);
  const discountAmt = (header.discount / 100) * grossTotal;
  const grandTotal  = grossTotal - discountAmt;

  return {
    rates, header, options, activeOption, activeOptionId, items,
    activeView, setActiveView,
    showRateCard, setShowRateCard,
    selectedItemId, setSelectedItemId,
    updateHeader,
    addOption, removeOption, duplicateOption, updateOptionLabel, setActiveOptionId,
    addItem, deleteItem, duplicateItem, updateItem, moveItem,
    saveRates,
    totals: { totalSqft, subTotal, installAmt, grossTotal, discountAmt, grandTotal },
  };
};
