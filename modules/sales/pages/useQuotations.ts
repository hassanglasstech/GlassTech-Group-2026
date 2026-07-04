import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, Client, Quotation, QuotationItem, ProductionPiece, Product } from '../../shared/types';
import { AsyncSalesService } from '../services/asyncSalesService';
import { ProductionService } from '../../production/services/productionService';
import { AppService } from '../../shared/services/appService';
import { useAppStore } from '../../shared/store/appStore';
import { toast } from 'sonner';

export const useQuotations = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [printingQuote, setPrintingQuote] = useState<Quotation | null>(null);
  
  const [modalTab, setModalTab] = useState<'items' | 'design' | 'upload'>('items');
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialQuotation: Partial<Quotation> = {
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    reqDate: '',
    clientId: '',
    projectName: '',
    items: [],
    status: 'Draft'
  };

  const [formData, setFormData] = useState<Partial<Quotation>>(initialQuotation);

  useEffect(() => { refreshData(); }, [company]);

  const refreshData = async () => {
    const all = await AsyncSalesService.getQuotations();
    setQuotations(all.filter(q => q.company === company && q.status !== 'Approved').sort((a,b) => b.id.localeCompare(a.id)));
    
    const allClients = await AsyncSalesService.getClients();
    setClients(allClients.filter(c => c.company === company));
    
    const allProducts = await AsyncSalesService.getProducts();
    setProducts(allProducts.filter(p => p.company === company));
  };

  const getAvailableThicknesses = () => {
      const valid = products.filter(p => p.category === 'Glass');
      const set = new Set(valid.map(p => p.thickness).filter(Boolean) as string[]);
      const sorted = Array.from(set).sort((a,b) => parseInt(a) - parseInt(b));
      return sorted.length > 0 ? sorted : ['5mm','6mm','8mm','10mm','12mm'];
  };

  const getAvailableTypes = () => {
      const valid = products.filter(p => p.category === 'Glass');
      const set = new Set(valid.map(p => p.glassType).filter(Boolean) as string[]);
      return set.size > 0 ? Array.from(set).sort() : ['Clear','Frosted','Tinted','Reflective','Plain','Mirror'];
  };

  const serviceNicks = useMemo(() => {
      const dbNicks = products.filter(p => p.category === 'Service' && p.serviceNick).map(p => p.serviceNick!);
      const standards = ['T/G', 'Notch', 'P/E', 'P/F', 'Double Glaze', 'R/D', 'Frosted', 'L/G'];
      return Array.from(new Set([...standards, ...dbNicks]));
  }, [products]);

  const calculateAutoRate = (size: string, type: string, services: string[]) => {
      const glass = products.find(p => p.category === 'Glass' && p.thickness === size && p.glassType === type);
      let baseRate = glass ? (glass.basePrice || 0) : 0;
      let serviceTotal = 0;
      const isTempered = services.includes('T/G');
      services.forEach(srvNick => {
          if (isTempered && srvNick !== 'T/G') return; 
          let serviceObj = products.find(p => p.category === 'Service' && p.serviceNick === srvNick && p.thickness === size);
          if (!serviceObj) serviceObj = products.find(p => p.category === 'Service' && p.serviceNick === srvNick && (p.thickness === 'All' || !p.thickness));
          if (serviceObj) serviceTotal += (serviceObj.basePrice || 0);
      });
      return baseRate + serviceTotal;
  };

  const getBillingDimension = (dim: number, threshold: number, inclusive: boolean = false) => {
      if (dim <= 0) return 0;
      const isBelow = inclusive ? dim <= threshold : dim < threshold;
      if (isBelow) return Math.ceil(dim / 6) * 6;
      return Math.ceil(dim / 12) * 12;
  };

  const updateGlassItem = (index: number, field: string, value: any) => {
    if (formData.status === 'Approved') return;
    const nextItems = [...(formData.items || [])];
    const item = { ...nextItems[index] } as any; 
    
    if (field === 'glassType' && value === 'Mirror') {
        item.selectedServices = item.selectedServices.filter((s: string) => s !== 'T/G');
    }

    item[field] = value;

    if (['glassSize', 'glassType', 'selectedServices'].includes(field)) {
        item.pricePerUnit = calculateAutoRate(item.glassSize || '5mm', item.glassType || 'Plain', item.selectedServices || []);
    }

    if (['inchW', 'sootW', 'inchH', 'sootH'].includes(field)) {
        item.width = (Number(item.inchW) || 0) + ((Number(item.sootW) || 0) / 8);
        item.height = (Number(item.inchH) || 0) + ((Number(item.sootH) || 0) / 8);
    }

    const w = item.width || 0;
    const h = item.height || 0;
    const q = item.qty || 0;

    let billW = w;
    let billH = h;
    const isTempered = (item.selectedServices || []).includes('T/G');

    if (isTempered) {
        billW = getBillingDimension(w, 12, true);
        billH = getBillingDimension(h, 12, true);
    } else {
        billW = getBillingDimension(w, 12, false);
        billH = getBillingDimension(h, 12, false);
    }

    const sqft = (billW * billH) / 144;
    item.totalSqFt = sqft * q;
    item.amount = item.totalSqFt * (item.pricePerUnit || 0);

    nextItems[index] = item;
    setFormData(prev => ({ ...prev, items: nextItems }));
  };

  const addGlassItem = () => {
    const newItem: QuotationItem = { 
        id: `ITM-${Date.now()}`, description: '', qty: 1, inchW: 0, sootW: 0, inchH: 0, sootH: 0, 
        width: 0, height: 0, glassSize: '5mm', glassType: 'Plain', selectedServices: [], 
        totalSqFt: 0, pricePerUnit: calculateAutoRate('5mm', 'Plain', []), amount: 0, 
        locationCode: '', glazingSpecs: '' 
    };
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), newItem] }));
  };

  const removeGlassItem = (idx: number) => {
    setFormData(prev => {
        const next = [...(prev.items || [])];
        next.splice(idx, 1);
        return { ...prev, items: next };
    });
  };

  const handleSave = async (approve: boolean) => {
    if (!formData.clientId) return alert("Client is required.");

    // Discount hard-cap — prevents negative invoices and revenue fraud.
    // Mirrors the server-side guard in asyncSalesService.saveQuotations.
    const _subTotal   = (formData.items ?? []).reduce((s, i) => s + (Number((i as any).amount) || 0), 0);
    const _discPct    = Number(formData.discountPercent ?? 0);
    const _discAmt    = Number(formData.discountAmount  ?? 0);
    if (_discPct > 99.99) {
      toast.error('Discount percent cannot exceed 99.99%.');
      return;
    }
    if (_subTotal > 0 && _discAmt > _subTotal) {
      toast.error(`Discount amount (PKR ${_discAmt.toLocaleString()}) exceeds subtotal (PKR ${_subTotal.toLocaleString()}).`);
      return;
    }
    
    const all = await AsyncSalesService.getQuotations();
    let finalId = formData.id;
    if (!finalId) finalId = AppService.generateSequenceID('QT', company, all);

    if (approve) {
        const today = new Date().toISOString().split('T')[0];
        if (formData.dueDate && formData.dueDate < today) {
            toast.error(`Quotation expired on ${formData.dueDate}. Update due date before converting to order.`);
            return;
        }
    }

    const finalQuo: Quotation = { 
        ...(formData as Quotation), 
        id: finalId!, 
        company, 
        status: approve ? 'Approved' : 'Draft',
        orderNo: approve ? AppService.generateSequenceID('SO', company, all.filter(q => q.orderNo)) : undefined
    };

    if (approve) {
        const currentPieces = ProductionService.getProductionPieces();
        const numericPart = finalQuo.orderNo?.split('-').pop() || '';
        
        const newPieces: ProductionPiece[] = [];
        let globalSerialCounter = 1;

        finalQuo.items.forEach((item, idx) => {
            for (let i = 0; i < item.qty; i++) {
                newPieces.push({
                    id: `${numericPart}/${globalSerialCounter}`,
                    orderId: finalQuo.orderNo!,
                    itemIndex: idx,
                    specs: `${item.width}x${item.height} ${item.glassSize || '5mm'} ${item.glassType || 'Plain'}`,
                    status: 'Cut',
                    lastUpdated: new Date().toISOString(), isRevised: false
                });
                globalSerialCounter++;
            }
        });
        const others = currentPieces.filter(p => !p.id.startsWith(`${numericPart}/`));
        // scope fix: skip the ghost re-check — the order is persisted just
        // below (saveQuotations) and `others` are already-saved prior-order pieces.
        // Validating the whole array let a stale prior order block this save.
        ProductionService.saveProductionPieces([...others, ...newPieces], { validateOrderIds: [] });
    }

    await AsyncSalesService.saveQuotations([...all.filter(x => x.id !== finalQuo.id), finalQuo]);
    await refreshData();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
      if (confirm("Delete?")) { 
          const all = await AsyncSalesService.getQuotations();
          await AsyncSalesService.saveQuotations(all.filter(x => x.id !== id)); 
          await refreshData(); 
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (selectedItemIndex === null) return;
      updateGlassItem(selectedItemIndex, 'designFile', base64);
    };
    reader.readAsDataURL(file);
  };

  return {
    company,
    quotations,
    clients,
    products,
    isModalOpen,
    setIsModalOpen,
    searchTerm,
    setSearchTerm,
    printingQuote,
    setPrintingQuote,
    modalTab,
    setModalTab,
    selectedItemIndex,
    setSelectedItemIndex,
    fileInputRef,
    formData,
    setFormData,
    initialQuotation,
    refreshData,
    getAvailableThicknesses,
    getAvailableTypes,
    serviceNicks,
    calculateAutoRate,
    getBillingDimension,
    updateGlassItem,
    addGlassItem,
    removeGlassItem,
    handleSave,
    handleDelete,
    handleFileUpload
  };
};
