
import React, { useState, useEffect } from 'react';
import { Product, StoreItem, Vendor } from '../../shared/types';
import { SalesService } from '../../sales/services/salesService';
import { supabase } from '../../../src/services/supabaseClient';
import { toast } from 'sonner';
import { X, Box, Tag, Building2, Hash, Layout, ListFilter, UploadCloud, Loader2, ImageOff, AlertTriangle } from 'lucide-react';

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
      mainCategory: '',
      subCategory: '',
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
      hsCode: ''
  });
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [newComponent, setNewComponent] = useState({ description: '', unit: 'PCS', qtyPerSet: 1 });
  const [isUploading, setIsUploading] = useState(false);
  const [duplicates, setDuplicates] = useState<Product[]>([]);
  const [showDupWarning, setShowDupWarning] = useState(false);

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
                hsCode: editingProduct.hsCode || ''
            });
        } else {
            setFormData({
                internalId: '', modelNo: '', description: '', brand: '', 
                mainCategory: '', subCategory: '', category: 'Hardware',
                unit: 'PCS', costPrice: 0, basePrice: 0, finishColor: '', material: '',
                direction: '', tongueLength: '', spindleLength: '', minLevel: 10,
                image: '', technicalSpecs: {}, width: 0, height: 0, frameColor: '', meshColor: '',
                isSet: false, setComponents: [], hsCode: ''
            });
        }
    }
  }, [isOpen, editingProduct]);

  // ─── Supabase Storage Upload ───────────────────────────────────────────────
  const uploadToSupabase = async (file: File): Promise<string | null> => {
    try {
      // Compress image first using canvas (200px thumbnail)
      const compressed = await compressImage(file, 300);
      const ext = 'jpg';
      const modelSlug = (formData.modelNo || `item-${Date.now()}`).replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
      const fileName = `nippon/${modelSlug}-${Date.now()}.${ext}`;

      const { error } = await supabase.storage
        .from('product-images')
        .upload(fileName, compressed, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (err) {
      console.error('Upload failed:', err);
      return null;
    }
  };

  const compressImage = (file: File, targetSize: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('No canvas context');

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, targetSize, targetSize);

          let drawW = img.width, drawH = img.height;
          if (drawW > drawH) {
            drawH = (drawH / drawW) * targetSize;
            drawW = targetSize;
          } else {
            drawW = (drawW / drawH) * targetSize;
            drawH = targetSize;
          }
          const offsetX = (targetSize - drawW) / 2;
          const offsetY = (targetSize - drawH) / 2;
          ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject('Blob conversion failed');
          }, 'image/jpeg', 0.82);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };


  // Duplicate detection on modelNo change
  const checkDuplicates = (modelNo: string, desc: string) => {
    if (!modelNo && !desc) { setDuplicates([]); return; }
    const all = SalesService.getProducts().filter(p => p.company === 'Nippon' && p.id !== (editingProduct?.id || ''));
    const mn = modelNo.trim().toUpperCase();
    const ds = desc.trim().toUpperCase();
    const found = all.filter(p =>
      (mn && p.modelNo?.toUpperCase() === mn) ||
      (ds && p.description?.toUpperCase() === ds)
    );
    setDuplicates(found);
  };
  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Sirf image files allowed hain');
    
    setIsUploading(true);

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, image: localUrl }));

    const publicUrl = await uploadToSupabase(file);

    if (publicUrl) {
      setFormData(prev => ({ ...prev, image: publicUrl }));
      URL.revokeObjectURL(localUrl);
      toast.success('Image uploaded successfully');
    } else {
      // Fallback: store as base64 locally if Supabase fails
      toast.error('Supabase upload failed — check Storage bucket "product-images" is public');
      setFormData(prev => ({ ...prev, image: '' }));
      URL.revokeObjectURL(localUrl);
    }

    setIsUploading(false);
  };

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSave = (force = false) => {
      if (!formData.description || !formData.unit) return toast.error("Description and Unit are required.");
      if (isUploading) return toast.error("Please wait — image still uploading...");
      if (!force && duplicates.length > 0) { setShowDupWarning(true); return; }
      
      const newProduct: Product = {
          id: editingProduct ? editingProduct.id : `NIP-${formData.modelNo || Date.now()}`,
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
          imageUrl: formData.image,
          variants: [],
          technicalSpecs: formData.technicalSpecs,
          width: Number(formData.width),
          height: Number(formData.height),
          frameColor: formData.frameColor,
          meshColor: formData.meshColor,
          isSet: formData.isSet,
          setComponents: formData.isSet ? formData.setComponents : [],
          hsCode: formData.hsCode
      };

      const storeData: Partial<StoreItem> = {
          minLevel: Number(formData.minLevel),
          unit: formData.unit
      };

      onSave(newProduct, storeData);
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

                {/* ── IMAGE UPLOAD ── */}
                <div 
                    className={`flex items-center space-x-6 bg-white p-4 rounded-2xl border-2 border-dashed transition-all group ${isDragging ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-red-300'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="relative w-24 h-24 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200 shrink-0">
                        {isUploading ? (
                            <div className="flex flex-col items-center gap-1">
                                <Loader2 size={24} className="text-red-500 animate-spin" />
                                <span className="text-[8px] font-black text-slate-400 uppercase">Uploading</span>
                            </div>
                        ) : formData.image ? (
                            <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <Box size={32} className="text-slate-300" />
                        )}
                        {!isUploading && (
                            <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                <UploadCloud size={20} className="text-white" />
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </label>
                        )}
                    </div>
                    <div className="flex-1">
                        <h4 className="text-xs font-black uppercase text-slate-700">Product Image</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                            {isUploading ? 'Uploading to Supabase Storage...' : 'Drag & drop or click to upload. Auto-compressed to 300px thumbnail.'}
                        </p>
                        {!isUploading && !formData.image && (
                            <label className="inline-block mt-2 cursor-pointer bg-red-600 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg hover:bg-red-700 transition-all">
                                Choose Image
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </label>
                        )}
                        {formData.image && !isUploading && (
                            <div className="flex items-center gap-3 mt-2">
                                <span className="text-[9px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                                    ✓ Saved to Supabase Storage
                                </span>
                                <button 
                                    onClick={() => setFormData({ ...formData, image: '' })}
                                    className="text-[10px] font-black text-rose-500 uppercase hover:underline flex items-center gap-1"
                                >
                                    <ImageOff size={10}/> Remove
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Internal ID (Reference #)</label>
                        <div className="relative">
                            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" className="sap-input w-full font-black uppercase text-indigo-600 pl-9" value={formData.internalId} onChange={e => setFormData({...formData, internalId: e.target.value})} placeholder="e.g. ERP-H-1001"/>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">HS Code</label>
                        <input type="text" className="sap-input w-full font-black uppercase text-slate-600" value={formData.hsCode} onChange={e => setFormData({...formData, hsCode: e.target.value})} placeholder="e.g. 8302.4100"/>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Main Category</label>
                        <div className="relative">
                            <Layout size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                            <select 
                                className="sap-input w-full font-bold uppercase text-xs pl-9"
                                value={formData.mainCategory}
                                onChange={e => {
                                    const newMain = e.target.value;
                                    setFormData({ ...formData, mainCategory: newMain, subCategory: newMain === 'Silicon' ? '' : formData.subCategory });
                                }}
                            >
                                <option value="">-- Select Category --</option>
                                <option value="Aluminium Products">Aluminium Products</option>
                                <option value="UPVC">UPVC</option>
                                <option value="Steel Mesh">Steel Mesh</option>
                                <option value="Silicon">Silicon</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Sub Category</label>
                        <div className="relative">
                            <ListFilter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                            <select 
                                className="sap-input w-full font-bold uppercase text-xs pl-9"
                                value={formData.subCategory}
                                onChange={e => setFormData({...formData, subCategory: e.target.value})}
                                disabled={formData.mainCategory === 'Silicon'}
                            >
                                <option value="">-- Select Sub Category --</option>
                                {formData.mainCategory !== 'Silicon' && (
                                    <>
                                        <option value="Windows">Windows</option>
                                        <option value="Doors">Doors</option>
                                    </>
                                )}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Model No / Code</label>
                        <input type="text" className="sap-input w-full font-black uppercase text-blue-600" value={formData.modelNo} onChange={e => { const v = e.target.value; setFormData({...formData, modelNo: v}); checkDuplicates(v, formData.description); }} placeholder="e.g. CZS133"/>
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
                                {nipponVendors.map(v => (
                                    <option key={v.id} value={v.name}>{v.name}</option>
                                ))}
                                <option value="Generic">Generic / Unlisted</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">Description</label>
                    <input type="text" className="sap-input w-full font-bold uppercase" value={formData.description} onChange={e => { const v = e.target.value; setFormData({...formData, description: v}); checkDuplicates(formData.modelNo, v); }} placeholder="Item Name..."/>
                </div>

                {/* DUPLICATE WARNING BANNER */}
                {duplicates.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-2 text-amber-700">
                            <AlertTriangle size={14}/>
                            <span className="text-[10px] font-black uppercase tracking-widest">Similar items found ({duplicates.length})</span>
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                            {duplicates.map(d => (
                                <div key={d.id} className="flex justify-between items-center bg-white border border-amber-200 rounded-lg px-2 py-1">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-700 uppercase">{d.description}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Model: {d.modelNo || '—'} | Color: {d.finishColor || '—'} | Dir: {d.direction || '—'}</p>
                                    </div>
                                    <span className="text-[8px] font-black text-amber-600 uppercase bg-amber-100 px-2 py-0.5 rounded-full">{d.id}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[9px] font-bold text-amber-600">Different color/direction? Fill specs below and save anyway.</p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Material Group</label>
                        <select className="sap-input w-full font-bold" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                            <option value="Hardware">Hardware</option>
                            <option value="Accessory">Accessory</option>
                            <option value="Consumable">Consumable</option>
                        </select>
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
                </div>

                {formData.unit === 'Set' && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-3">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" id="isSet" 
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
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.direction} onChange={e => setFormData({...formData, direction: e.target.value})} placeholder="Left / Right"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Tongue / Size</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.tongueLength} onChange={e => setFormData({...formData, tongueLength: e.target.value})} placeholder="e.g. 55mm"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Spindle Length</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.spindleLength} onChange={e => setFormData({...formData, spindleLength: e.target.value})} placeholder="e.g. 30mm"/>
                        </div>
                        {formData.unit === 'Roll' && (
                            <>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase text-slate-400">Roll Width (m)</label>
                                    <input type="number" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.width || ''} onChange={e => setFormData({...formData, width: Number(e.target.value)})} placeholder="0.00"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase text-slate-400">Roll Height (m)</label>
                                    <input type="number" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.height || ''} onChange={e => setFormData({...formData, height: Number(e.target.value)})} placeholder="0.00"/>
                                </div>
                            </>
                        )}
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Frame Color</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.frameColor} onChange={e => setFormData({...formData, frameColor: e.target.value})} placeholder="e.g. White"/>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase text-slate-400">Mesh Color</label>
                            <input type="text" className="w-full p-2 bg-white border rounded-lg text-xs font-bold uppercase" value={formData.meshColor} onChange={e => setFormData({...formData, meshColor: e.target.value})} placeholder="e.g. Grey"/>
                        </div>

                        {Object.entries(formData.technicalSpecs).map(([key, value]) => (
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
                    
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <input type="text" className="p-2 bg-white border rounded-lg text-xs font-bold" placeholder="Spec Name" value={newSpecKey} onChange={e => setNewSpecKey(e.target.value)} />
                        <div className="flex gap-1">
                            <input type="text" className="p-2 bg-white border rounded-lg text-xs font-bold flex-1" placeholder="Value" value={newSpecValue} onChange={e => setNewSpecValue(e.target.value)} />
                            <button 
                                onClick={() => {
                                    if(newSpecKey && newSpecValue) {
                                        setFormData({...formData, technicalSpecs: {...formData.technicalSpecs, [newSpecKey]: newSpecValue}});
                                        setNewSpecKey(''); setNewSpecValue('');
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
                <button 
                    onClick={handleSave} 
                    disabled={isUploading}
                    className="bg-red-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Box size={16}/>}
                    <span>{isUploading ? 'Uploading...' : 'Save Hardware'}</span>
                </button>
            </div>


            {/* DUPLICATE CONFIRM MODAL */}
            {showDupWarning && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[600] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in zoom-in duration-150">
                        <div className="flex items-center gap-3 text-amber-600">
                            <AlertTriangle size={20}/>
                            <h3 className="text-sm font-black uppercase">Duplicate Warning</h3>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">Same Model No or Description already exists. Save anyway?</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {duplicates.map(d => (
                                <div key={d.id} className="bg-slate-50 rounded-lg px-3 py-1.5 border">
                                    <p className="text-[10px] font-black text-slate-700 uppercase">{d.description}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Model: {d.modelNo} | Color: {d.finishColor || '—'} | Dir: {d.direction || '—'}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => setShowDupWarning(false)} className="px-4 py-2 text-xs font-bold text-slate-400 uppercase hover:text-slate-600">Cancel</button>
                            <button onClick={() => { setShowDupWarning(false); handleSave(true); }} className="px-5 py-2 text-xs font-black text-white uppercase rounded-xl bg-amber-500 hover:bg-amber-600 tracking-widest">Save Anyway</button>
                        </div>
                    </div>
                </div>
            )}
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
                                        <input type="text" className="sap-input w-full text-xs" value={newComponent.description} onChange={e => setNewComponent({...newComponent, description: e.target.value})} placeholder="e.g. Handle Body"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-400">Unit</label>
                                        <select className="sap-input w-full text-xs" value={newComponent.unit} onChange={e => setNewComponent({...newComponent, unit: e.target.value})}>
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
                                        <input type="number" className="sap-input w-full text-xs" value={newComponent.qtyPerSet} onChange={e => setNewComponent({...newComponent, qtyPerSet: Number(e.target.value)})}/>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if(newComponent.description) {
                                                setFormData({ ...formData, setComponents: [...formData.setComponents, { ...newComponent, id: `COMP-${Date.now()}` }] });
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
                                        <button onClick={() => setFormData({ ...formData, setComponents: formData.setComponents.filter((_, i) => i !== idx) })} className="text-rose-500 p-1 hover:bg-rose-50 rounded"><X size={14}/></button>
                                    </div>
                                ))}
                                {formData.setComponents.length === 0 && (
                                    <p className="text-center text-[10px] font-bold text-slate-400 uppercase py-4">No components added yet</p>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t flex justify-end">
                            <button onClick={() => setIsSetModalOpen(false)} className="bg-slate-800 text-white px-6 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest">Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default NipponProductForm;
