import { useState, useCallback } from 'react';
import {
  DEFAULT_RATE_CARD, GLASS_RATES,
  autoRefNo, autoSubject, validityDate, STANDARD_TERMS,
  RateCard, WINDOW_TYPES,
} from './gtkQuotationConstants';
import { GTKQuoteHeader, GTKQuoteItem, GTKQuoteOption, GTKQuotation } from './gtkQuotationTypes';
import { WindowTypeId } from './gtkQuotationConstants';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';
import { NotificationService } from '@/modules/shared/services/notificationService';
import { SalesService } from '@/modules/sales/services/salesService';

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

// ─── COST ESTIMATION (for margin calc) ───────────────────────────────────────
// Estimated material cost ratios vs sell price (from typical GTK margins)
const COST_RATIO: Record<string, number> = {
  'Non-Thermal':    0.58,  // 42% gross margin
  'Thermal Break':  0.55,  // 45% gross margin
  'AluWood OAK':    0.52,  // 48% gross margin
  'AluWood TEAK':   0.52,
  'uPVC White':     0.60,  // 40% gross margin
  'uPVC Black Lami':0.60,
};

export const calcMargin = (
  items: GTKQuoteItem[],
  profileType: string,
  installAmt: number,
  cartage: number,
  discountAmt: number
) => {
  const sellAlum  = items.reduce((s, i) => s + i.aluminumAmt, 0);
  const sellGlass = items.reduce((s, i) => s + i.glassAmt,    0);
  const sellNet   = items.reduce((s, i) => s + i.nettingAmt,  0);
  const grossSell = sellAlum + sellGlass + sellNet + installAmt + cartage - discountAmt;

  const ratio      = COST_RATIO[profileType] ?? 0.58;
  const estAlumCost = sellAlum  * ratio;
  const estGlassCost = sellGlass * 0.70; // glass cost ~70% of sell
  const estNetCost  = sellNet   * 0.65;
  const estInstCost = installAmt * 0.55;
  const totalCost   = estAlumCost + estGlassCost + estNetCost + estInstCost;
  const grossProfit = grossSell - totalCost;
  const marginPct   = grossSell > 0 ? (grossProfit / grossSell) * 100 : 0;

  return {
    grossSell, totalCost, grossProfit, marginPct,
    sellAlum, sellGlass, estAlumCost, estGlassCost,
    perSqftSell: items.reduce((s,i)=>s+i.totalSqft,0) > 0
      ? grossSell / items.reduce((s,i)=>s+i.totalSqft,0)
      : 0,
    perSqftCost: items.reduce((s,i)=>s+i.totalSqft,0) > 0
      ? totalCost / items.reduce((s,i)=>s+i.totalSqft,0)
      : 0,
  };
};

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

// ─── SUPABASE PERSISTENCE ────────────────────────────────────────────────────

const LS_KEY = 'gtk_erp_quotations_draft';

const getLocalQuotations = (): GTKQuotation[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
};

const saveLocalQuotations = (list: GTKQuotation[]) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
};

export const listGTKQuotations = async (company = 'GTK'): Promise<GTKQuotation[]> => {
  try {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('company', company)
      .order('updated_at', { ascending: false });

    if (error || !data) return getLocalQuotations();

    const mapped: GTKQuotation[] = data.map((r) => ({
      ...r.data,
      id: r.id,
      company: r.company,
    }));
    saveLocalQuotations(mapped);
    return mapped;
  } catch {
    return getLocalQuotations();
  }
};

export const persistQuotation = async (q: GTKQuotation): Promise<void> => {
  // Update local cache
  const local = getLocalQuotations();
  const idx = local.findIndex(x => x.id === q.id);
  if (idx >= 0) local[idx] = q; else local.unshift(q);
  saveLocalQuotations(local);

  // Supabase
  try {
    const { error } = await supabase.from('quotations').upsert([{
      id: q.id,
      company: q.company,
      data: q,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'id' });
    if (error) Logger.warn('GTKQuotation', 'Supabase save failed', error);
  } catch (e) {
    Logger.warn('GTKQuotation', 'Supabase unavailable', e);
  }
};

export const deleteGTKQuotation = async (id: string): Promise<void> => {
  const local = getLocalQuotations().filter(q => q.id !== id);
  saveLocalQuotations(local);
  try {
    await supabase.from('quotations').delete().eq('id', id);
  } catch (e) {
    Logger.warn('GTKQuotation', 'Delete failed', e);
  }
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

  // Phase 3: persistence state
  const [quotationId, setQuotationId]     = useState<string>('');
  const [quotationStatus, setQuotationStatus] = useState<GTKQuotation['status']>('Draft');
  const [isDirty, setIsDirty]             = useState(false);
  const [isSaving, setIsSaving]           = useState(false);

  const activeOption = options.find(o => o.id === activeOptionId) ?? options[0];
  const items = activeOption?.items ?? [];

  // ── Header ────────────────────────────────────────────────────────────────
  const updateHeader = useCallback(<K extends keyof GTKQuoteHeader>(field: K, value: GTKQuoteHeader[K]) => {
    setIsDirty(true);
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
    setIsDirty(true);
    const sums = sumOption(newItems);
    setOptions(prev => prev.map(o => o.id === optId
      ? { ...o, items: newItems, ...sums }
      : o
    ));
  }, []);

  const addOption = useCallback(() => {
    const labels = ['Option A','Option B','Option C','Option D','Revised-1','Revised-2','Final'];
    const used = options.map(o => o.label);
    const label = labels.find(l => !used.includes(l)) ?? `Option ${options.length + 1}`;
    const opt = makeOption(label, header.profileType, header.sectionSize);
    setOptions(prev => [...prev, opt]);
    setActiveOptionId(opt.id);
    setIsDirty(true);
  }, [options, header.profileType, header.sectionSize]);

  const removeOption = useCallback((id: string) => {
    if (options.length <= 1) return;
    setOptions(prev => prev.filter(o => o.id !== id));
    if (activeOptionId === id) {
      const remaining = options.filter(o => o.id !== id);
      setActiveOptionId(remaining[0]?.id ?? '');
    }
    setIsDirty(true);
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
    setIsDirty(true);
  }, [options]);

  const updateOptionLabel = useCallback((id: string, label: string) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, label } : o));
    setIsDirty(true);
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
    setIsDirty(true);
  }, [header.mode]);

  // ── Phase 3: Save quotation ───────────────────────────────────────────────
  const saveQuotation = useCallback(async (status?: GTKQuotation['status']) => {
    setIsSaving(true);
    const id = quotationId || `GTK-Q-${Date.now().toString(36).toUpperCase()}`;
    const finalStatus = status ?? quotationStatus;
    const q: GTKQuotation = {
      id,
      company: 'GTK',
      status: finalStatus,
      header,
      options,
      activeOptionId,
      createdAt: quotationId ? '' : new Date().toISOString(), // will be overwritten from DB on load
      updatedAt: new Date().toISOString(),
    };
    await persistQuotation(q);
    setQuotationId(id);
    setQuotationStatus(finalStatus);
    setIsDirty(false);
    setIsSaving(false);
    toast.success(`Quotation ${id} saved — ${finalStatus}`);
    return id;
  }, [quotationId, quotationStatus, header, options, activeOptionId]);

  // ── Phase 3: Load quotation ───────────────────────────────────────────────
  const loadQuotation = useCallback((q: GTKQuotation) => {
    setRates(DEFAULT_RATE_CARD); // reset rates (not stored per-quotation yet)
    setHeader(q.header);
    setOptions(q.options);
    setActiveOptionId(q.activeOptionId || q.options[0]?.id || '');
    setQuotationId(q.id);
    setQuotationStatus(q.status);
    setIsDirty(false);
    setActiveView('builder');
  }, []);

  // ── Phase 3: New quotation ────────────────────────────────────────────────
  const newQuotation = useCallback(() => {
    const firstOpt = makeOption('Option A');
    setHeader(makeDefaultHeader());
    setOptions([firstOpt]);
    setActiveOptionId(firstOpt.id);
    setQuotationId('');
    setQuotationStatus('Draft');
    setIsDirty(false);
    setActiveView('builder');
  }, []);

  // ── Phase 3: Update status ────────────────────────────────────────────────
  // GAP-01: Quotation Rejection Workflow — on transition to Rejected, generate
  // a WhatsApp notification for the client + dashboard tracking entry. Without
  // this, a sales rep could mark Rejected and the client would never know
  // their proposal was officially closed.
  const updateStatus = useCallback(async (status: GTKQuotation['status']) => {
    const prevStatus = quotationStatus;
    setQuotationStatus(status);
    await saveQuotation(status);

    if (status === 'Rejected' && prevStatus !== 'Rejected' && quotationId) {
      try {
        const client = SalesService.getClients().find((c: any) => c.id === header.clientId);
        const phone = client?.phone || client?.contactPhone;
        NotificationService.create({
          eventType: 'custom',
          orderRef: quotationId,
          targetCompany: 'GTK',
          recipientName: header.clientName || client?.name || 'Client',
          recipientPhone: phone,
          title: `Quotation ${quotationId} — Rejected`,
          templateData: {
            message:
              `Dear ${header.clientName || 'Sir/Madam'},\n\n` +
              `Quotation *${quotationId}* (${header.subject || header.site || 'your project'}) ` +
              `has been closed without acceptance. If you would like to revise scope or ` +
              `request a fresh offer, please reach out to your account manager.\n\n` +
              `— GlassTech (GTK)`,
          },
          link: `/sales?quotation=${quotationId}`,
        });
        Logger.action('Sales', 'QUOTATION_REJECTED', `${quotationId} → ${header.clientName}`);
      } catch (e) {
        Logger.warn('Sales', 'Rejection notification failed', e);
      }
    }
  }, [saveQuotation, quotationId, quotationStatus, header.clientId, header.clientName, header.subject, header.site]);

  // ── Totals (active option) ────────────────────────────────────────────────
  const totalSqft   = items.reduce((s, i) => s + i.totalSqft, 0);
  const subTotal    = items.reduce((s, i) => s + i.total, 0);
  const installAmt  = header.installationIncluded ? totalSqft * 120 : 0;
  const grossTotal  = subTotal + installAmt + (header.cartage || 0);
  const discountAmt = (header.discount / 100) * grossTotal;
  const grandTotal  = grossTotal - discountAmt;

  // ── Phase 3: Margin ───────────────────────────────────────────────────────
  const margin = calcMargin(items, header.profileType, installAmt, header.cartage || 0, discountAmt);

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
    // Phase 3
    quotationId, quotationStatus, isDirty, isSaving,
    saveQuotation, loadQuotation, newQuotation, updateStatus,
    margin,
  };
};
