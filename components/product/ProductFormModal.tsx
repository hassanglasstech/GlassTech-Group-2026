
import React, { useState, useEffect } from 'react';
import { Company, Product, StoreItem } from '../../modules/shared/types';
import { X, Factory } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product, storeItem?: Partial<StoreItem>) => void;
  editingProduct: Product | null;
  company: Company;
  existingNicks: string[];
  initialMode: 'Material' | 'Service';
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({ 
  isOpen, onClose, onSave, editingProduct, company, existingNicks, initialMode 
}) => {
  // Comment: Define isServiceMode to be used throughout the component, fixing the reference error on line 245
  const isServiceMode = initialMode === 'Service' || (editingProduct && editingProduct.category === 'Service');

  // Item Definition State
  const [itemMode, setItemMode] = useState<'Glass' | 'General'>(company === 'Nippon' ? 'General' : 'Glass');
  const [isCustomNick, setIsCustomNick] = useState(false);

  // Glass Configurator State
  const [glassForm, setGlassForm] = useState({
    type: 'Plain' as 'Plain' | 'Color' | 'Mirror' | 'Fluted',
    subType: 'Standard', 
    thickness: '5mm',
    color: 'Clear',
    width: 0,
    height: 0,
    costPrice: '' as string | number,
    salesPrice: '' as string | number,
    temperingPrice: '' as string | number
  });

  // String states for custom decimal inputs (prevents dot-eating on parseFloat)
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  // General Item Form
  const [generalForm, setGeneralForm] = useState({
      name: '',
      category: 'Hardware' as 'Hardware' | 'Consumable' | 'Raw',
      subCategory: '',
      unit: 'Pcs',
      minLevel: 50,
      costPrice: '' as string | number,
      salesPrice: '' as string | number,
      brand: '',
      modelNo: '',
      finishColor: '',
      material: '',
      imageUrl: ''
  });

  // Service Form
  const [serviceForm, setServiceForm] = useState({
    description: '',
    nick: '', 
    thickness: '5mm',
    unit: 'SqFt',
    costPrice: 0,
    salesPrice: 0,
    vendor: ''
  });

  // Initialize Form Data
  useEffect(() => {
    if (isOpen) {
        if (editingProduct) {
            if (editingProduct.category === 'Glass') {
                setItemMode('Glass');
                const [w, h] = editingProduct.sheetSize ? editingProduct.sheetSize.split('x').map(Number) : [0, 0];
                setGlassForm({
                    type: (editingProduct.glassType as any) || 'Plain',
                    subType: editingProduct.subCategory || 'Standard',
                    thickness: editingProduct.thickness || '5mm',
                    color: editingProduct.finishColor || 'Clear',
                    width: w || 0,
                    height: h || 0,
                    costPrice: editingProduct.costPrice || 0,
                    salesPrice: editingProduct.basePrice,
                    temperingPrice: editingProduct.temperingPrice || ''
                });
            } else if (['Hardware', 'Consumable', 'Raw'].includes(editingProduct.category)) {
                setItemMode('General');
                setGeneralForm({
                    name: editingProduct.description,
                    category: (editingProduct.category as any) || 'Hardware',
                    subCategory: editingProduct.subCategory || '',
                    unit: editingProduct.unit,
                    minLevel: 0,
                    costPrice: editingProduct.costPrice || 0,
                    salesPrice: editingProduct.basePrice,
                    brand: editingProduct.brand || '',
                    modelNo: editingProduct.modelNo || '',
                    finishColor: editingProduct.finishColor || '',
                    material: editingProduct.material || '',
                    imageUrl: editingProduct.imageUrl || ''
                });
            } else if (editingProduct.category === 'Service') {
                const isNickStandard = existingNicks.includes(editingProduct.serviceNick || '');
                setIsCustomNick(editingProduct.serviceNick ? !isNickStandard : false);
                setServiceForm({
                    description: editingProduct.description,
                    nick: editingProduct.serviceNick || '',
                    thickness: editingProduct.thickness || '5mm',
                    unit: editingProduct.unit as string,
                    costPrice: editingProduct.costPrice || 0,
                    salesPrice: editingProduct.basePrice,
                    vendor: editingProduct.brand || ''
                });
            }
        } else {
            // Default to General for Nippon
            setItemMode(company === 'Nippon' ? 'General' : 'Glass');
            setGlassForm({ type: 'Plain', subType: 'Standard', thickness: '5mm', color: 'Clear', width: 0, height: 0, costPrice: '', salesPrice: '', temperingPrice: '' });
            setCustomW(''); setCustomH('');
            setGeneralForm({ name: '', category: 'Hardware', subCategory: '', unit: 'Pcs', minLevel: 50, costPrice: '', salesPrice: '', brand: '', modelNo: '', finishColor: '', material: '', imageUrl: '' });
            setServiceForm({ description: '', nick: '', thickness: '5mm', unit: 'SqFt', costPrice: 0, salesPrice: 0, vendor: '' });
            setIsCustomNick(false);
        }
    }
  }, [isOpen, editingProduct, existingNicks, company]);

  if (!isOpen) return null;

  const generateGlassDescription = () => {
    const dim = glassForm.width > 0 && glassForm.height > 0 ? `(${glassForm.width}"x${glassForm.height}")` : '';
    let desc = `${glassForm.thickness} `;
    if (glassForm.type === 'Mirror') {
        desc += `${glassForm.subType} Mirror`;
    } else {
        if (glassForm.color && glassForm.color !== 'Clear' && glassForm.color !== 'N/A') desc += `${glassForm.color} `;
        desc += `${glassForm.type} Glass`;
    }
    return `${desc} ${dim}`.trim().replace(/\s+/g, ' ');
  };

  const handleSave = () => {
    // Comment: Use isServiceMode defined in component scope instead of local re-calculation
    if (!isServiceMode) {
        let productData: Product;
        let storeItemData: any = {};

        if (itemMode === 'Glass') {
            if (!glassForm.thickness || glassForm.width <= 0 || glassForm.height <= 0) return alert("Dimensions required for Glass.");
            const desc = generateGlassDescription();
            const finalCost = Number(glassForm.costPrice) || 0;
            
            productData = {
                id: editingProduct ? editingProduct.id : `GLS-${Date.now()}`,
                company, 
                category: 'Glass', 
                description: desc,
                basePrice: Number(glassForm.salesPrice) || 0, 
                temperingPrice: (glassForm.type === 'Mirror' || glassForm.subType === 'One Side') ? undefined : (Number(glassForm.temperingPrice) || undefined),
                costPrice: finalCost, 
                unit: 'SqFt',
                variants: [], 
                glassType: glassForm.type, 
                subCategory: (glassForm.type === 'Plain' || glassForm.type === 'Fluted') ? 'Standard' : glassForm.subType, 
                thickness: glassForm.thickness, 
                finishColor: (glassForm.type === 'Mirror' || glassForm.type === 'Plain' || glassForm.type === 'Fluted') ? 'N/A' : glassForm.color,
                sheetSize: `${glassForm.width}x${glassForm.height}`
            };
            
            storeItemData = {
                category: 'Raw', 
                unit: 'SqFt', 
                conversionFactor: Number(((glassForm.width * glassForm.height)/144).toFixed(2))
            };

        } else {
            if (!generalForm.name || !generalForm.unit) return alert("Name and Unit required.");
            const finalCost = Number(generalForm.costPrice) || 0;

            productData = {
                id: editingProduct ? editingProduct.id : `ITM-${Date.now()}`,
                company, 
                category: generalForm.category, 
                description: generalForm.name.toUpperCase(),
                basePrice: Number(generalForm.salesPrice) || 0, 
                costPrice: finalCost, 
                unit: generalForm.unit as any,
                variants: [],
                subCategory: generalForm.subCategory,
                brand: generalForm.brand,
                modelNo: generalForm.modelNo,
                finishColor: generalForm.finishColor,
                material: generalForm.material,
                imageUrl: generalForm.imageUrl
            };

            storeItemData = {
                category: generalForm.category, 
                unit: generalForm.unit, 
                conversionFactor: 0,
                minLevel: generalForm.minLevel
            };
        }
        
        onSave(productData, storeItemData);

    } else {
        if (!serviceForm.description) return alert("Service name required.");
        if (!serviceForm.nick) return alert("Service Nick is required for Quotation.");
        
        const productData: Product = {
          id: editingProduct ? editingProduct.id : `SVC-${Date.now()}`,
          company,
          category: 'Service',
          description: serviceForm.description.toUpperCase(),
          serviceNick: serviceForm.nick, 
          thickness: serviceForm.thickness,
          basePrice: Number(serviceForm.salesPrice) || 0,
          costPrice: Number(serviceForm.costPrice) || 0,
          unit: serviceForm.unit as any,
          variants: [],
          brand: serviceForm.vendor
        };

        onSave(productData);
    }
  };

  const isMirror = glassForm.type === 'Mirror';
  const isPlain = glassForm.type === 'Plain';
  const isFluted = glassForm.type === 'Fluted';
  const isColor = glassForm.type === 'Color';
  const isOneSide = glassForm.subType === 'One Side';
  
  const mirrorSubTypes = ['Belgium', 'CFG', 'Euro Grey', 'Brown'];
  const colorSubTypes = ['One Side', 'Tinted'];

  const subTypesToUse = isMirror 
    ? mirrorSubTypes 
    : isColor 
        ? colorSubTypes 
        : [];

  const getAvailableColors = () => {
    if (isMirror || isPlain || isFluted) return ['N/A'];
    if (isColor) {
      if (glassForm.subType === 'One Side') return ['Imported Grey', 'Brown'];
      if (glassForm.subType === 'Tinted') return ['Brown', 'Grey'];
    }
    return ['Clear'];
  };

  const temperingDisabled = isMirror || (isColor && isOneSide);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
        <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-300">
        <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <div><h3 className="text-xl font-black uppercase tracking-tight">{editingProduct ? 'Edit Item' : 'New Master Data'}</h3></div>
            <button onClick={onClose}><X size={24}/></button>
        </div>
        
        <div className="p-8 space-y-6 bg-slate-50 overflow-y-auto max-h-[70vh]">
            {!isServiceMode ? (
                <>
                    {company !== 'Nippon' && (
                        <div className="flex bg-slate-200 p-1 rounded-xl mb-4">
                            <button onClick={() => setItemMode('Glass')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${itemMode === 'Glass' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>Glass Sheet</button>
                            <button onClick={() => setItemMode('General')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${itemMode === 'General' ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}>General Item</button>
                        </div>
                    )}

                    {itemMode === 'Glass' ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Thickness</label>
                                    <div className="flex gap-1.5">
                                        <select value={['5mm','6mm','8mm','10mm','12mm','19mm'].includes(glassForm.thickness) ? glassForm.thickness : 'custom'} 
                                            onChange={e => {
                                                if (e.target.value === 'custom') return;
                                                setGlassForm({...glassForm, thickness: e.target.value});
                                            }} 
                                            className="flex-1 p-3 rounded-xl border font-bold">
                                            <option>5mm</option>
                                            <option>6mm</option>
                                            <option>8mm</option>
                                            <option>10mm</option>
                                            <option>12mm</option>
                                            <option>19mm</option>
                                            <option value="custom">Custom...</option>
                                        </select>
                                        <input 
                                            type="text" placeholder="e.g. 4mm"
                                            value={!['5mm','6mm','8mm','10mm','12mm','19mm'].includes(glassForm.thickness) && glassForm.thickness !== '5mm' ? glassForm.thickness : ''}
                                            onChange={e => setGlassForm({...glassForm, thickness: e.target.value || '5mm'})}
                                            className={`w-20 p-3 rounded-xl border font-black text-center text-amber-700 bg-amber-50 ${!['5mm','6mm','8mm','10mm','12mm','19mm'].includes(glassForm.thickness) ? 'ring-2 ring-amber-300' : ''}`}
                                            title="Custom thickness"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Category (Glass Type)</label>
                                    <select value={glassForm.type} onChange={e => {
                                        const newType = e.target.value as any;
                                        setGlassForm({
                                            ...glassForm, 
                                            type: newType,
                                            subType: newType === 'Mirror' ? 'Belgium' : (newType === 'Color' ? 'One Side' : 'Standard'),
                                            color: 'N/A'
                                        });
                                    }} className="w-full p-3 rounded-xl border font-bold">
                                        <option value="Plain">Plain</option>
                                        <option value="Color">Color</option>
                                        <option value="Mirror">Mirror</option>
                                        <option value="Fluted">Fluted</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Sub-Category</label>
                                    <select 
                                        disabled={isPlain || isFluted}
                                        value={glassForm.subType} 
                                        onChange={e => {
                                            const newSub = e.target.value;
                                            setGlassForm({
                                                ...glassForm, 
                                                subType: newSub,
                                                color: isColor ? (newSub === 'One Side' ? 'Imported Grey' : 'Brown') : 'N/A'
                                            });
                                        }} 
                                        className={`w-full p-3 rounded-xl border font-bold ${(isPlain || isFluted) ? 'opacity-30' : ''}`}
                                    >
                                        {(isPlain || isFluted) ? (
                                            <option>N/A</option>
                                        ) : (
                                            subTypesToUse.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))
                                        )}
                                    </select>
                                </div>
                                <div className={`space-y-1 transition-opacity ${(!isColor) ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Glass Colour</label>
                                    <select 
                                        disabled={!isColor} 
                                        value={glassForm.color} 
                                        onChange={e => setGlassForm({...glassForm, color: e.target.value})} 
                                        className="w-full p-3 rounded-xl border font-bold"
                                    >
                                        {getAvailableColors().map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Width (Inch)</label>
                                    <div className="flex gap-1.5">
                                        <select 
                                            value={[78, 84, 96].includes(glassForm.width) ? glassForm.width : 'custom'} 
                                            onChange={e => {
                                                if (e.target.value === 'custom') return;
                                                setCustomW('');
                                                setGlassForm({...glassForm, width: Number(e.target.value)});
                                            }} 
                                            className="flex-1 p-3 rounded-xl border font-black"
                                        >
                                            <option value={0}>-</option>
                                            <option value={78}>78"</option>
                                            <option value={84}>84"</option>
                                            <option value={96}>96"</option>
                                            <option value="custom">Custom...</option>
                                        </select>
                                        <input 
                                            type="text" inputMode="decimal"
                                            placeholder="W"
                                            value={customW || (![0, 78, 84, 96].includes(glassForm.width) ? String(glassForm.width) : '')}
                                            onChange={e => {
                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                setCustomW(val);
                                                const num = parseFloat(val);
                                                if (!isNaN(num)) setGlassForm(f => ({...f, width: num}));
                                                else if (val === '') setGlassForm(f => ({...f, width: 0}));
                                            }}
                                            onBlur={() => {
                                                const num = parseFloat(customW);
                                                if (!isNaN(num)) { setGlassForm(f => ({...f, width: num})); setCustomW(''); }
                                                else { setCustomW(''); }
                                            }}
                                            className={`w-16 p-3 rounded-xl border font-black text-center text-amber-700 bg-amber-50 ${![0, 78, 84, 96].includes(glassForm.width) ? 'ring-2 ring-amber-300' : ''}`}
                                            title="Custom width"
                                        />
                                    </div>
                                    {glassForm.width > 0 && ![78, 84, 96].includes(glassForm.width) && (
                                        <span className="text-[8px] font-black text-amber-600 uppercase">Custom: {glassForm.width}"</span>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Height (Inch)</label>
                                    <div className="flex gap-1.5">
                                        <select 
                                            value={[144].includes(glassForm.height) ? glassForm.height : 'custom'} 
                                            onChange={e => {
                                                if (e.target.value === 'custom') return;
                                                setCustomH('');
                                                setGlassForm({...glassForm, height: Number(e.target.value)});
                                            }} 
                                            className="flex-1 p-3 rounded-xl border font-black"
                                        >
                                            <option value={0}>-</option>
                                            <option value={144}>144"</option>
                                            <option value="custom">Custom...</option>
                                        </select>
                                        <input 
                                            type="text" inputMode="decimal"
                                            placeholder="H"
                                            value={customH || (![0, 144].includes(glassForm.height) ? String(glassForm.height) : '')}
                                            onChange={e => {
                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                setCustomH(val);
                                                const num = parseFloat(val);
                                                if (!isNaN(num)) setGlassForm(f => ({...f, height: num}));
                                                else if (val === '') setGlassForm(f => ({...f, height: 0}));
                                            }}
                                            onBlur={() => {
                                                const num = parseFloat(customH);
                                                if (!isNaN(num)) { setGlassForm(f => ({...f, height: num})); setCustomH(''); }
                                                else { setCustomH(''); }
                                            }}
                                            className={`w-16 p-3 rounded-xl border font-black text-center text-amber-700 bg-amber-50 ${![0, 144].includes(glassForm.height) ? 'ring-2 ring-amber-300' : ''}`}
                                            title="Custom height"
                                        />
                                    </div>
                                    {glassForm.height > 0 && ![144].includes(glassForm.height) && (
                                        <span className="text-[8px] font-black text-amber-600 uppercase">Custom: {glassForm.height}"</span>
                                    )}
                                </div>
                            </div>
                            {/* Custom size sqft preview */}
                            {glassForm.width > 0 && glassForm.height > 0 && (
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                        {glassForm.width}" × {glassForm.height}" = {((glassForm.width * glassForm.height) / 144).toFixed(2)} sqft/sheet
                                    </span>
                                    {(![78, 84, 96].includes(glassForm.width) || ![144].includes(glassForm.height)) && (
                                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                            NON-STANDARD SIZE
                                        </span>
                                    )}
                                </div>
                            )}

                        </>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-slate-400">Item Name / Description</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Handle CZS133-L55" 
                                    value={generalForm.name} 
                                    onChange={e => setGeneralForm({...generalForm, name: e.target.value})} 
                                    className="w-full p-3 rounded-xl border font-bold uppercase"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Category</label>
                                    <select value={generalForm.category} onChange={e => setGeneralForm({...generalForm, category: e.target.value as any})} className="w-full p-3 rounded-xl border font-bold">
                                        <option value="Hardware">Hardware</option>
                                        <option value="Consumable">Consumable</option>
                                        <option value="Raw">Raw Material</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Unit of Measure</label>
                                    <select value={generalForm.unit} onChange={e => setGeneralForm({...generalForm, unit: e.target.value})} className="w-full p-3 rounded-xl border font-bold">
                                        <option value="Pcs">Pieces (Pcs)</option>
                                        <option value="Set">Set</option>
                                        <option value="Box">Box</option>
                                        <option value="Kg">Kilogram (Kg)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="bg-slate-100 p-4 rounded-xl space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Brand</label>
                                        <input type="text" placeholder="e.g. Kin Long" value={generalForm.brand} onChange={e => setGeneralForm({...generalForm, brand: e.target.value})} className="w-full p-2 bg-white border rounded-lg font-bold text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Model No.</label>
                                        <input type="text" placeholder="e.g. CZS133" value={generalForm.modelNo} onChange={e => setGeneralForm({...generalForm, modelNo: e.target.value})} className="w-full p-2 bg-white border rounded-lg font-bold text-xs" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Purchase Cost</label>
                                    <input type="number" value={generalForm.costPrice} onChange={e => setGeneralForm({...generalForm, costPrice: e.target.value})} className="w-full p-3 rounded-xl border font-black text-emerald-600" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-slate-400">Selling Price</label>
                                    <input type="number" value={generalForm.salesPrice} onChange={e => setGeneralForm({...generalForm, salesPrice: e.target.value})} className="w-full p-3 rounded-xl border font-black text-blue-600" />
                                </div>
                            </div>
                        </>
                    )}
                </>
            ) : (
                <>
                    <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Service Name</label><input type="text" placeholder="e.g. Tempering 12mm" value={serviceForm.description} onChange={e => setServiceForm({...serviceForm, description: e.target.value})} className="w-full p-3 rounded-xl border font-bold uppercase"/></div>
                    
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Service Nick (Quotation Shortcode)</label>
                        <div className="flex space-x-2">
                            <select 
                                className="w-full p-3 rounded-xl border font-bold"
                                value={isCustomNick ? 'NEW' : serviceForm.nick}
                                onChange={(e) => {
                                    if(e.target.value === 'NEW') {
                                        setIsCustomNick(true);
                                        setServiceForm({...serviceForm, nick: ''});
                                    } else {
                                        setIsCustomNick(false);
                                        setServiceForm({...serviceForm, nick: e.target.value});
                                    }
                                }}
                            >
                                <option value="">Select Nick...</option>
                                {existingNicks.map(n => <option key={n} value={n}>{n}</option>)}
                                <option value="NEW" className="font-black text-blue-600">+ Add New Nick...</option>
                            </select>
                            {isCustomNick && (
                                <input 
                                type="text" 
                                placeholder="Enter New Nick" 
                                className="w-full p-3 rounded-xl border font-black text-blue-600 uppercase"
                                value={serviceForm.nick}
                                onChange={e => setServiceForm({...serviceForm, nick: e.target.value})}
                                autoFocus
                                />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-slate-400">Thickness Link</label>
                            <select value={serviceForm.thickness} onChange={e => setServiceForm({...serviceForm, thickness: e.target.value})} className="w-full p-3 rounded-xl border font-bold">
                                <option>All</option>
                                <option>5mm</option>
                                <option>6mm</option>
                                <option>8mm</option>
                                <option>10mm</option>
                                <option>12mm</option>
                                <option>19mm</option>
                            </select>
                        </div>
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Billing Unit</label><select value={serviceForm.unit} onChange={e => setServiceForm({...serviceForm, unit: e.target.value})} className="w-full p-3 rounded-xl border font-bold"><option>SqFt</option><option>RunningFt</option><option>Unit</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-400">Factory Cost</label><input type="number" value={serviceForm.costPrice} onChange={e => setServiceForm({...serviceForm, costPrice: Number(e.target.value)})} className="w-full p-3 rounded-xl border font-black"/></div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-slate-400">Client Rate</label>
                            <input type="number" value={serviceForm.salesPrice} onChange={e => setServiceForm({...serviceForm, salesPrice: Number(e.target.value)})} className="w-full p-3 rounded-xl border font-black"/>
                        </div>
                    </div>
                </>
            )}
        </div>

        <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3">
            <button onClick={onClose} className="px-6 py-2 text-slate-400 font-bold uppercase text-xs">Cancel</button>
            <button onClick={handleSave} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl">{editingProduct ? 'Update Item' : 'Confirm & Create'}</button>
        </div>
        </div>
    </div>
  );
};

export default ProductFormModal;
