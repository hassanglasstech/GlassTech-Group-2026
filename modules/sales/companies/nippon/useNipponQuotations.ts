import { useState, useEffect, useMemo, useRef } from 'react';
import { Company, Client, Quotation, QuotationItem, Product } from '@/modules/shared/types';
import { AsyncSalesService } from '@/modules/sales/services/asyncSalesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { StoreItem } from '@/modules/procurement/types/inventory';

export const useNipponQuotations = () => {
  const company: Company = 'Nippon';
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [printingQuote, setPrintingQuote] = useState<Quotation | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initialQuotation: Partial<Quotation> = {
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    clientId: '',
    projectName: '',
    items: [],
    status: 'Draft',
    discountPercent: 0,
    discountAmount: 0,
  };

  const [formData, setFormData] = useState<Partial<Quotation>>(initialQuotation);

  const subTotal = formData.items?.reduce((s, i) => s + i.amount, 0) || 0;

  const lastSerial = useMemo(() => {
    const all = quotations.filter(q => q.company === company && q.manualSerial);
    if (all.length === 0) return '0000';
    const sorted = all.sort((a, b) => b.date.localeCompare(a.date) || (b.manualSerial || '').localeCompare(a.manualSerial || ''));
    return sorted[0].manualSerial;
  }, [quotations]);

  useEffect(() => {
    refreshData();
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshData = async () => {
    const all = await AsyncSalesService.getQuotations();
    setQuotations(all.filter(q => q.company === company && q.status !== 'Approved').sort((a,b) => b.id.localeCompare(a.id)));
    
    const allClients = await AsyncSalesService.getClients();
    setClients(allClients.filter(c => c.company === company));
    
    const allProducts = await AsyncSalesService.getProducts();
    setProducts(allProducts.filter(p => p.company === company));

    const allStore = InventoryService.getStore();
    setStoreItems(allStore);
  };

  const handleAddSection = (title?: string, index?: number) => {
    setFormData(prev => {
      const newItems = [...(prev.items || [])];
      const newSection: QuotationItem = { 
        id: `SEC-${Date.now()}`, 
        isSection: true, 
        description: title || '', 
        qty: 0, width: 0, height: 0, totalSqFt: 0, pricePerUnit: 0, amount: 0, locationCode: '', glazingSpecs: '' 
      };
      if (index !== undefined) {
        newItems.splice(index + 1, 0, newSection);
      } else {
        newItems.push(newSection);
      }
      return { ...prev, items: newItems };
    });
  };

  const handleAddItem = (index?: number) => {
    const newItem: QuotationItem = {
      id: `ITM-${Date.now()}`, 
      description: '', 
      locationCode: '', 
      glazingSpecs: '', // Brand
      glassSize: 'PCS', 
      qty: 1, 
      width: 0, height: 0, totalSqFt: 0,
      pricePerUnit: 0, 
      amount: 0, 
    };
    setFormData(prev => {
      const newItems = [...(prev.items || [])];
      if (index !== undefined) {
        newItems.splice(index + 1, 0, newItem);
      } else {
        newItems.push(newItem);
      }
      return { ...prev, items: newItems };
    });
  };

  const updateItem = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const item = { ...next[index], [field]: value };
      
      if (!item.isSection) {
        // If description is updated, we might be selecting a product
        // But we handle explicit selection in the UI for better control
        item.amount = (Number(item.qty) || 0) * (Number(item.pricePerUnit) || 0);
      }
      
      next[index] = item;
      return { ...prev, items: next };
    });
  };

  const selectProduct = (index: number, prod: any) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const item = { ...next[index] };
      
      const specs = [
        prod.thickness,
        prod.sheetSize,
        prod.finishColor,
        prod.material,
        prod.glassType,
        prod.subCategory,
        prod.modelNo,
        prod.direction,
        prod.tongueLength,
        prod.spindleLength,
        prod.profileRole,
        prod.systemSubClass,
        ...(prod.technicalSpecs ? Object.values(prod.technicalSpecs) : [])
      ].filter(Boolean).join(' | ');

      let desc = `${prod.itemCode || prod.profileCode ? (prod.itemCode || prod.profileCode) + ' ' : ''}${prod.name || prod.description || ''} ${specs ? `(${specs})` : ''}`;
      
      if (prod.isSet && prod.setComponents && prod.setComponents.length > 0) {
          const compNames = prod.setComponents.map((c: any) => `${c.description} (${c.qtyPerSet} ${c.unit})`).join(', ');
          desc += `\n[Includes: ${compNames}]`;
      }

      item.description = desc;
      item.locationCode = prod.itemCode || prod.profileCode || '';
      item.pricePerUnit = prod.price || prod.basePrice || 0;
      item.glassSize = prod.unit || 'PCS';
      item.glazingSpecs = prod.brand || ''; // Brand
      item.amount = (Number(item.qty) || 1) * (Number(item.pricePerUnit) || 0);
      item.attachedImage = prod.imageUrl || prod.image;
      
      next[index] = item;
      return { ...prev, items: next };
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      next.splice(index, 1);
      return { ...prev, items: next };
    });
  };

  const handleDuplicateItem = (index: number) => {
    setFormData(prev => {
      const next = [...(prev.items || [])];
      const original = next[index];
      const copy = { ...original, id: `ITM-DUP-${Date.now()}-${index}` };
      next.splice(index + 1, 0, copy);
      return { ...prev, items: next };
    });
  };

  const handleSave = async (approve: boolean) => {
    if (!formData.clientId) return alert("Client is required.");
    if (!formData.manualSerial) return alert("Serial Number is required.");
    
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const mmyy = `${mm}${yy}`;

    const all = await AsyncSalesService.getQuotations();

    const isDuplicate = all.some(q => 
        q.company === company && 
        q.manualSerial === formData.manualSerial && 
        q.id !== formData.id
    );
    if (isDuplicate) return alert(`Serial Number ${formData.manualSerial} is already used!`);
    
    let finalId = formData.id;
    if (!finalId) finalId = `QT-${mmyy}-${formData.manualSerial}`;

    const finalQuo: Quotation = { 
      ...(formData as Quotation), 
      id: finalId!, 
      company, 
      status: approve ? 'Approved' : 'Draft',
      orderNo: approve ? `SO-${mmyy}-${formData.manualSerial}` : undefined
    };

    if (approve) {
      const currentStore = InventoryService.getStore();
      const updatedStore = [...currentStore];
      
      finalQuo.items.forEach(item => {
        if (item.isSection) return;
        const storeIdx = updatedStore.findIndex(s => s.id === item.locationCode);
        if (storeIdx !== -1) {
          updatedStore[storeIdx] = {
            ...updatedStore[storeIdx],
            unrestrictedQty: (updatedStore[storeIdx].unrestrictedQty || 0) - (Number(item.qty) || 0),
            quantity: (updatedStore[storeIdx].quantity || 0) - (Number(item.qty) || 0)
          };
        }
      });
      InventoryService.saveStore(updatedStore);
    }

    await AsyncSalesService.saveQuotations([...all.filter(x => x.id !== finalQuo.id), finalQuo]);
    await refreshData();
    setView('list');
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this quotation?")) {
      const all = await AsyncSalesService.getQuotations();
      await AsyncSalesService.saveQuotations(all.filter(x => x.id !== id));
      await refreshData();
    }
  };

  return {
    quotations,
    clients,
    products,
    storeItems,
    view,
    setView,
    searchTerm,
    setSearchTerm,
    printingQuote,
    setPrintingQuote,
    activeDropdown,
    setActiveDropdown,
    dropdownRef,
    formData,
    setFormData,
    subTotal,
    lastSerial,
    handleAddSection,
    handleAddItem,
    updateItem,
    handleRemoveItem,
    handleDuplicateItem,
    handleSave,
    handleDelete,
    selectProduct,
    initialQuotation
  };
};
