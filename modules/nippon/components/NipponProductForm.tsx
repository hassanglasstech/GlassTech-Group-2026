
import React, { useState, useEffect } from 'react';
import { Product, StoreItem, Vendor } from '../../shared/types';
import { SalesService } from '../../sales/services/salesService';
import { toast } from 'sonner';
import { supabase } from '@/src/services/supabaseClient';
import { X, Box, Tag, Building2, Hash, Layout, ListFilter, UploadCloud } from 'lucide-react';

const PRODUCT_IMAGE_BUCKET = 'product-images';

// Upload a base64 data-URL to the product-images bucket, named by product id.
// Returns the public URL. Storing a short URL (not a ~50KB base64 blob) in
// products.image_url is what keeps the row small enough to persist — base64
// payloads silently bust Supabase's body limit on batch upsert, so the image
// "vanishes" from the list after refresh even though the edit form still holds
// it in memory.
async function uploadProductImage(productId: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${productId}.jpg`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

interface NipponProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product, storeItem?: Partial<StoreItem>) => void;
  editingProduct: Product | null;
}

const NipponProductForm: React.FC<NipponProductFormProps> = ({ 
  isOpen, onClose, onSave, editingProduct
}) => {
  const [nipponVendors, setNipponVendors] = useState<Vendor[]>([]);
  const [formData, setFormData] = useState({
      internalId: '',
      modelNo: '',
      description: '',
      brand: '',
      mainCategory: '', // Added: Window, Door
      subCategory: '', // Added: Handle
      category: 'Hardware' as 'Hardware' | 'Accessory' | 'Consumable',
      unit: 'PCS',
      costPrice: 0,
      basePrice: 0,
      finishColor: '',
      material: '',
      direction: '',
      tongueLength: '',
      spindleLength: '',
      minLevel: 10,
      image: '',
      technicalSpecs: {} as Record<string, string>,
      width: 0,
      height: 0,
      frameColor: '',
      meshColor: '',
      isSet: false,
      setComponents: [] as { id: string; description: string; unit: string; qtyPerSet: number }[],
      hsCode: '',
      subDescription: ''
  });
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [newComponent, setNewComponent] = useState({ description: '', unit: 'PCS', qtyPerSet: 1 });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
        const allVendors = SalesService.getVendors();
        setNipponVendors(allVendors.filter(v => v.company === 'Nippon'));

        if (editingProduct) {
            setFormData({
                internalId: editingProduct.profileCode || '',
                modelNo: editingProduct.modelNo || '',
                description: editingProduct.description,
                brand: editingProduct.brand || '',
                mainCategory: editingProduct.mainCategory || '',
                subCategory: editingProduct.subCategory || '',
                category: (editingProduct.category as any) || 'Hardware',
                unit: editingProduct.unit as string,
                costPrice: editingProduct.costPrice || 0,
                basePrice: editingProduct.basePrice || 0,
                finishColor: editingProduct.finishColor || '',
                material: editingProduct.material || '',
                direction: editingProduct.direction || '',
                tongueLength: editingProduct.tongueLength || '',
                spindleLength: editingProduct.spindleLength || '',
                minLevel: 10,
                image: editingProduct.imageUrl || '',
                technicalSpecs: editingProduct.technicalSpecs || {},
                width: editingProduct.width || 0,
                height: editingProduct.height || 0,
                frameColor: editingProduct.frameColor || '',
                meshColor: editingProduct.meshColor || '',
                isSet: editingProduct.isSet || false,
                setComponents: editingProduct.setComponents || [],
                hsCode: editingProduct.hsCode || '',
                subDescription: (editingProduct as any).subDescription || ''
            });
        } else {
            setFormData({
                internalId: '', modelNo: '', description: '', brand: '', 
                mainCategory: '', subCategory: '', category: 'Hardware',
                unit: 'PCS', costPrice: 0, basePrice: 0, finishColor: '', material: '',
                direction: '', tongueLength: '', spindleLength: '', minLevel: 10,
                image: '', technicalSpecs: {}, width: 0, height: 0, frameColor: '', meshColor: '',
                isSet: false, setComponents: [], hsCode: '', subDescription: ''
            });
        }
    }
  }, [isOpen, editingProduct]);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const TARGET_SIZE = 400;
            canvas.width = TARGET_SIZE;
            canvas.height = TARGET_SIZE;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
                
                let drawWidth = img.width;
                let drawHeight = img.height;
                
                if (drawWidth > drawHeight) {
                    drawHeight = (drawHeight / drawWidth) * TARGET_SIZE;
                    drawWidth = TARGET_SIZE;
                } else {
                    drawWidth = (drawWidth / drawHeight) * TARGET_SIZE;
                    drawHeight = TARGET_SIZE;
                }
                
                const offsetX = (TARGET_SIZE - drawWidth) / 2;
                const offsetY = (TARGET_SIZE - drawHeight) / 2;
                ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            }
            
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            setFormData(prev => ({ ...prev, image: compressedBase64 }));
        };
        img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSave = async () => {
      if (!formData.description || !formData.unit) return toast.error("Description and Unit are required.");
      if (isSaving) return;
      setIsSaving(true);

      const prodId = editingProduct ? editingProduct.id : `NIP-${formData.modelNo || Date.now()}`;

      // If a new image was picked it's an in-memory base64 data-URL. Push it to
      // the bucket and keep only the public URL on the product. Already-uploaded
      // images (http URL) pass through untouched.
      let finalImageUrl = formData.image;
      if (formData.image && formData.image.startsWith('data:')) {
        try {
          finalImageUrl = await uploadProductImage(prodId, formData.image);
        } catch (err) {
          setIsSaving(false);
          return toast.error(`Image upload failed: ${(err as Error)?.message || 'unknown'}. Product not saved.`);
        }
      }

      const newProduct: Product = {
          id: prodId,
          company: 'Nippon',
          category: formData.category,
          mainCategory: formData.mainCategory,
          subCategory: formData.subCategory,
          description: formData.description.toUpperCase(),
          modelNo: formData.modelNo?.toUpperCase(),
          brand: formData.brand.toUpperCase(),
          profileCode: formData.internalId.toUpperCase(),
          unit: formData.unit as any,
          costPrice: Number(formData.costPrice),
          basePrice: Number(formData.basePrice),
          finishColor: formData.finishColor,
          material: formData.material,
          direction: formData.direction,
          tongueLength: formData.tongueLength,
          spindleLength: formData.spindleLength,
          imageUrl: finalImageUrl,
          variants: [],
          technicalSpecs: formData.technicalSpecs,
          width: Number(formData.width),
          height: Number(formData.height),
          frameColor: formData.frameColor,
          meshColor: formData.meshColor,
          isSet: formData.isSet,
          setComponents: formData.isSet ? formData.setComponents : [],
          hsCode: formData.hsCode,
          subDescription: (formData as any).subDescription || ''
      };

      const storeData: Partial<StoreItem> = {
          minLevel: Number(formData.minLevel),
          unit: formData.unit
      };

      // onSave is async (parent does Supabase upsert + refresh). Await it so
      // the "Saving…" button state actually reflects the cloud round-trip and
      // any toast the parent fires lands before the modal closes.
      try {
        await Promise.resolve(onSave(newProduct, storeData));
      } finally {
        setIsSaving(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[400]">
        <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 border border-slate-300">
            <div className="px-8 py-6 bg-red-700 text-white flex justify-between items-center shrink-0">
                <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">{editingProduct ? 'Edit Component' : 'New Hardware Item'}</h3>
                    <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest mt-1">Nippon Catalog Entry</p>
                </div>
                <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-full transition-all"><X size={24}/></button>
            </div>
            
            <div className="p-8 space-y-6 bg-slate-50 overflow-y-auto max-h-[70vh]">
                {/* IMAGE UPLOAD SECTION */}
                <div 
                    className={`flex items-center space-x-6 bg-white p-4 rounded-2xl border-2 border-dashed transition-all group ${isDragging ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-red-300'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="relative w-24 h-24 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200 shrink-0">
                        {formData.image ? (
                            <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <Box size={32} className="text-slate-300" />
                        )}
                        <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                            <UploadCloud size={20} className="text-white" />
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </label>
                    </div>
                    <div>
                        <h4 className="text-xs font-black uppercase text-slate-700">Product Image</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Upload a clear photo for the catalog and invoices.</p>
                        {formData.image && (
                            <button 
                                onClick={() => setFormData({ ...formData, image: '' })}
                                className="text-[10px] font-black text-rose-500 uppercase mt-2 hover:underline"
                            >
                                Remove Image
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">KinLong Doc Code</label>
                        <div className="relative">
                            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" className="sap-input w-full font-black uppercase text-indigo-600 pl-9" value={formData.internalId} onChange={e => setFormData({...formData, internalId: e.target.value})} placeholder="e.g. CZS133 (on supplier PI)"/>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">HS Code</label>
                        <input type="text" className="sap-input w-full font-black uppercase text-slate-600" value={formData.hsCode} onChange={e => setFormData({...formData, hsCode: e.target.value})} placeholder="e.g. 8302.4100"/>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Material Group</label>
                        <div className="relative">
                            <Layout size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                            <select
                                className="sap-input w-full font-bold uppercase text-xs pl-9"
                                value={formData.mainCategory}
                                onChange={e => setFormData({...formData, mainCategory: e.target.value})}
                            >
                                <option value="">-- Select Group --</option>
                                <option value="Handles">Handles</option>
                                <option value="Hinges & Stays">Hinges &amp; Stays</option>
                                <option value="Locking System">Locking System</option>
                                <option value="Sliding & Lift System">Sliding &amp; Lift System</option>
                                <option value="Profiles & Point-Fixing">Profiles &amp; Point-Fixing</option>
                                <option value="Sealants">Sealants</option>
                                <option value="Door Closing">Door Closing</option>
                                <option value="Fasteners & Consumables">Fasteners &amp; Consumables</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Sub-Group</label>
                        <div className="relative">
                            <ListFilter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                            <input
                                type="text"
                                className="sap-input w-full font-bold uppercase text-xs pl-9"
                                value={formData.subCategory}
                                onChange={e => setFormData({...formData, subCategory: e.target.value})}
                                placeholder="e.g. Window Handle"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Match Status</label>
                        <select
                            className="sap-input w-full font-bold uppercase text-xs"
                            value={(formData.technicalSpecs as Record<string, string>)['matchStatus'] || ''}
                            onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, matchStatus: e.target.value}})}
                        >
                            <option value="">-- Not Set --</option>
                            <option value="Exact Match">Exact Match</option>
                            <option value="Near-Match">Near-Match</option>
                            <option value="ERP Only">ERP Only</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Main Material Type</label>
                        <select className="sap-input w-full font-bold" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                            <option value="Hardware">Hardware</option>
                            <option value="Accessory">Accessory</option>
                            <option value="Consumable">Consumable</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">ERP Model No</label>
                        <input type="text" className="sap-input w-full font-black uppercase text-blue-600" value={formData.modelNo} onChange={e => setFormData({...formData, modelNo: e.target.value})} placeholder="e.g. CZS133-L55"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Brand / Vendor</label>
                        <div className="relative">
                            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                            <select 
                                className="sap-input w-full font-black uppercase text-xs pl-9"
                                value={formData.brand}
                                onChange={e => setFormData({...formData, brand: e.target.value})}
                            >
                                <option value="">-- Select Partner --</option>
                                <option value="KIN LONG">KIN LONG</option>
                                <option value="Soleron">Soleron</option>
                                <option value="HuangXing">HuangXing</option>
                                <option value="SIWAY">SIWAY</option>
                                {nipponVendors
                                    .filter(v => !['KIN LONG', 'Soleron', 'HuangXing', 'SIWAY'].includes(v.name))
                                    .map(v => (
                                        <option key={v.id} value={v.name}>{v.name}</option>
                                    ))}
                                <option value="Generic">Generic / Unlisted</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">Description</label>
                    <input type="text" className="sap-input w-full font-bold uppercase" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Item Name..."/>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">Sub Description <span className="text-slate-300 normal-case font-normal">(optional detail line)</span></label>
                    <input type="text" className="sap-input w-full text-slate-500" value={(formData as any).subDescription || ''} onChange={e => setFormData({...formData, subDescription: e.target.value} as any)} placeholder="e.g. For sliding windows, concealed type..."/>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">Unit</label>
                    <select className="sap-input w-full font-bold" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})}>
                        <option value="PCS">Piece (PCS)</option>
                        <option value="Set">Set</option>
                        <option value="Pair">Pair</option>
                        <option value="Box">Box</option>
                        <option value="Roll">Roll</option>
                        <option value="Kg">Kg</option>
                    </select>
                </div>

                {formData.unit === 'Set' && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-3">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    id="isSet" 
                                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    checked={formData.isSet}
                                    onChange={e => setFormData({...formData, isSet: e.target.checked})}
                                />
                                <label htmlFor="isSet" className="text-xs font-black uppercase text-amber-800 cursor-pointer">This is a Product Set</label>
                            </div>
                            {formData.isSet && (
                                <button 
                                    onClick={() => setIsSetModalOpen(true)}
                                    className="text-[10px] font-black bg-amber-600 text-white px-3 py-1 rounded-lg uppercase tracking-widest shadow-sm hover:bg-amber-700 transition-all"
                                >
                                    Manage Components ({formData.setComponents.length})
                                </button>
                            )}
                        </div>
                        {formData.isSet && formData.setComponents.length > 0 && (
                            <div className="text-[10px] font-bold text-amber-700 uppercase">
                                Components: {formData.setComponents.map(c => `${c.description} (${c.qtyPerSet} ${c.unit})`).join(', ')}
                            </div>
                        )}
                    </div>
                )}

                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-3 text-slate-500">
                        <Tag size={14}/> <span className="text-[10px] font-black uppercase tracking-widest">Technical Specifications</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {/* ── FIXED SPECS ── */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Finish / Color</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.finishColor} onChange={e => setFormData({...formData, finishColor: e.target.value})} placeholder="e.g. Black"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Material</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.material} onChange={e => setFormData({...formData, material: e.target.value})} placeholder="e.g. Zinc Alloy"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Direction</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.direction} onChange={e => setFormData({...formData, direction: e.target.value})} placeholder="Left / Right / Universal"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Tongue / Bolt Length</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.tongueLength} onChange={e => setFormData({...formData, tongueLength: e.target.value})} placeholder="e.g. 54MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Spindle Size</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.spindleLength} onChange={e => setFormData({...formData, spindleLength: e.target.value})} placeholder="e.g. 10*10*100MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Width (MM)</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.width || ''} onChange={e => setFormData({...formData, width: Number(e.target.value) || 0})} placeholder="e.g. 28MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Height (MM)</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.height || ''} onChange={e => setFormData({...formData, height: Number(e.target.value) || 0})} placeholder="e.g. 21.6MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">LM / Roll</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['LM/Roll'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'LM/Roll': e.target.value}})}
                                placeholder="e.g. 250 LM/Roll"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Load Bearing (KG)</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Load Bearing'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Load Bearing': e.target.value}})}
                                placeholder="e.g. 110 KG"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Max Load Bearing</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Max Load Bearing'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Max Load Bearing': e.target.value}})}
                                placeholder="e.g. 80 kg/2pcs"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Length (MM)</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Length'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Length': e.target.value}})}
                                placeholder="e.g. 300 MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Screw Size</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Screw Size'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Screw Size': e.target.value}})}
                                placeholder="e.g. M5*35MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Square Steel</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Square Steel'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Square Steel': e.target.value}})}
                                placeholder="e.g. 8*8*100MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Open Angle (°)</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Open Angle'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Open Angle': e.target.value}})}
                                placeholder="e.g. 90° / 180°"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Hole Size</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Hole Size'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Hole Size': e.target.value}})}
                                placeholder="e.g. Ø25MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Thickness</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Thickness'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Thickness': e.target.value}})}
                                placeholder="e.g. 2MM"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Applicable For</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Applicable'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Applicable': e.target.value}})}
                                placeholder="e.g. Door / Window / Both"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Weight</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase"
                                value={(formData.technicalSpecs as any)['Weight'] || ''}
                                onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, 'Weight': e.target.value}})}
                                placeholder="e.g. 450g"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Frame Color</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.frameColor} onChange={e => setFormData({...formData, frameColor: e.target.value})} placeholder="e.g. White"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Mesh Color</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.meshColor} onChange={e => setFormData({...formData, meshColor: e.target.value})} placeholder="e.g. Grey"/>
                        </div>

                        {/* DYNAMIC SPECS (matchStatus is edited via the Match Status dropdown above) */}
                        {Object.entries(formData.technicalSpecs).filter(([key]) => key !== 'matchStatus').map(([key, value]) => (
                            <div key={key} className="space-y-1 relative group">
                                <label className="text-[9px] font-bold uppercase text-slate-400">{key}</label>
                                <input 
                                    type="text" 
                                    className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase pr-8" 
                                    value={value} 
                                    onChange={e => setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, [key]: e.target.value}})}
                                />
                                <button 
                                    onClick={() => {
                                        const newSpecs = {...formData.technicalSpecs};
                                        delete newSpecs[key];
                                        setFormData({...formData, technicalSpecs: newSpecs});
                                    }}
                                    className="absolute right-2 top-6 text-rose-400 opacity-0 group-hover:opacity-100"
                                >
                                    <X size={12}/>
                                </button>
                            </div>
                        ))}
                    </div>
                    
                    {/* ADD NEW SPEC */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <input type="text" className="p-2 bg-white border rounded-lg text-xs font-bold" placeholder="Spec Name" value={newSpecKey} onChange={e => setNewSpecKey(e.target.value)} />
                        <div className="flex gap-1">
                            <input type="text" className="p-2 bg-white border rounded-lg text-xs font-bold flex-1" placeholder="Value" value={newSpecValue} onChange={e => setNewSpecValue(e.target.value)} />
                            <button 
                                onClick={() => {
                                    if(newSpecKey && newSpecValue) {
                                        setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, [newSpecKey]: newSpecValue}});
                                        setNewSpecKey('');
                                        setNewSpecValue('');
                                    }
                                }}
                                className="bg-slate-800 text-white px-3 rounded-lg text-xs font-black"
                            >+</button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Cost Price (PKR)</label>
                        <input type="number" className="sap-input w-full font-black text-emerald-600" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: Number(e.target.value)})}/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Sales Price (PKR)</label>
                        <input type="number" className="sap-input w-full font-black text-blue-600" value={formData.basePrice} onChange={e => setFormData({...formData, basePrice: Number(e.target.value)})}/>
                    </div>
                </div>
            </div>

            <div className="px-8 py-6 bg-white border-t flex justify-end space-x-3">
                <button onClick={onClose} className="px-6 py-2 text-slate-400 font-bold uppercase text-xs hover:text-slate-600">Cancel</button>
                <button onClick={handleSave} disabled={isSaving} className="bg-red-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    <Box size={16}/> <span>{isSaving ? 'Saving…' : 'Save Hardware'}</span>
                </button>
            </div>

            {/* SET COMPONENTS MODAL */}
            {isSetModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[500]">
                    <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="px-6 py-4 bg-amber-600 text-white flex justify-between items-center">
                            <h4 className="text-sm font-black uppercase tracking-widest">Set Components</h4>
                            <button onClick={() => setIsSetModalOpen(false)}><X size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Description</label>
                                        <input 
                                            type="text" 
                                            className="sap-input w-full text-xs" 
                                            value={newComponent.description} 
                                            onChange={e => setNewComponent({...newComponent, description: e.target.value})}
                                            placeholder="e.g. Handle Body"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Unit</label>
                                        <select 
                                            className="sap-input w-full text-xs" 
                                            value={newComponent.unit} 
                                            onChange={e => setNewComponent({...newComponent, unit: e.target.value})}
                                        >
                                            <option value="PCS">PCS</option>
                                            <option value="Set">Set</option>
                                            <option value="Pair">Pair</option>
                                            <option value="Box">Box</option>
                                            <option value="Kg">Kg</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Qty Per Set</label>
                                        <input 
                                            type="number" 
                                            className="sap-input w-full text-xs" 
                                            value={newComponent.qtyPerSet} 
                                            onChange={e => setNewComponent({...newComponent, qtyPerSet: Number(e.target.value)})}
                                        />
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if(newComponent.description) {
                                                setFormData({
                                                    ...formData,
                                                    setComponents: [...formData.setComponents, { ...newComponent, id: `COMP-${Date.now()}` }]
                                                });
                                                setNewComponent({ description: '', unit: 'PCS', qtyPerSet: 1 });
                                            }
                                        }}
                                        className="mt-5 bg-amber-600 text-white px-4 rounded-lg font-black text-xs"
                                    >ADD</button>
                                </div>
                            </div>

                            <div className="border-t pt-4 space-y-2 max-h-48 overflow-y-auto">
                                {formData.setComponents.map((comp, idx) => (
                                    <div key={comp.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border">
                                        <div>
                                            <p className="text-xs font-black uppercase text-slate-700">{comp.description}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">{comp.qtyPerSet} {comp.unit}</p>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    setComponents: formData.setComponents.filter((_, i) => i !== idx)
                                                });
                                            }}
                                            className="text-rose-500 p-1 hover:bg-rose-50 rounded"
                                        ><X size={14}/></button>
                                    </div>
                                ))}
                                {formData.setComponents.length === 0 && (
                                    <p className="text-center text-[10px] font-bold text-slate-400 uppercase py-4">No components added yet</p>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
                            <button 
                                onClick={() => setIsSetModalOpen(false)}
                                className="bg-slate-800 text-white px-6 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest"
                            >Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default NipponProductForm;
