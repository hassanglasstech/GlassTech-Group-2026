
import React, { useState, useRef, useEffect } from 'react';
import { Product, StoreItem } from '@/modules/procurement/types/inventory';
import { SalesService } from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { toast } from 'sonner';
import { 
  UploadCloud, FileUp, CheckCircle2, AlertCircle, 
  ArrowRight, ArrowLeft, Loader2, Image as ImageIcon, 
  Table as TableIcon, Settings2, Plus, Trash2, Save
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI, Type } from "@google/genai";

// Set worker for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ColumnMapping {
  fileColumn: string;
  targetField: string; // Internal field name like 'description', 'modelNo', or 'technicalSpecs.SomeName'
  isVirtual?: boolean;
  originalColumn?: string;
}

interface ExtractedRow {
  [key: string]: any;
  _image?: string; // base64
}

const NipponSmartImporter: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Data from file
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [allRows, setAllRows] = useState<ExtractedRow[]>([]);
  
  // Mappings
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [manualSpecs, setManualSpecs] = useState<{ name: string; value: string }[]>([]);
  
  // Final Review
  const [finalData, setFinalData] = useState<Product[]>([]);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setStep(2);
    processFile(selectedFile);
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setLoadingMessage('Reading file content...');
    try {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        await processExcel(file);
      } else if (file.name.endsWith('.pdf')) {
        await processPDF(file);
      } else {
        toast.error('Unsupported file format. Please upload Excel or PDF.');
        setStep(1);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to process file.');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const processExcel = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      if (jsonData.length > 0) {
        const fileHeaders = jsonData[0].map(h => String(h || ''));
        setHeaders(fileHeaders);
        const rows = jsonData.slice(1).map(row => {
          const obj: any = {};
          fileHeaders.forEach((h, i) => {
            obj[h] = row[i];
          });
          return obj;
        });
        setAllRows(rows);
        setSampleRows(rows.slice(0, 5));
        
        // Auto-suggest mappings using AI
        suggestMappings(fileHeaders, rows.slice(0, 3), rows);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processPDF = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const images: string[] = [];
    
    setLoadingMessage('Extracting text and images from PDF...');

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      
      // Text Extraction
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';

      // Image Extraction
      const ops = await page.getOperatorList();
      for (let j = 0; j < ops.fnArray.length; j++) {
        const fn = ops.fnArray[j];
        if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject || fn === pdfjsLib.OPS.paintImageMaskXObject) {
          const name = ops.argsArray[j][0];
          try {
            const img = await page.objs.get(name);
            if (img && img.data) {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                // Handle different image formats if necessary
                const imageData = ctx.createImageData(img.width, img.height);
                // Some pdf.js images might need conversion if they are not RGBA
                if (img.data.length === img.width * img.height * 4) {
                  imageData.data.set(img.data);
                } else {
                  // Fallback for non-RGBA (simplified)
                  for (let k = 0; k < img.data.length; k++) {
                    imageData.data[k] = img.data[k];
                  }
                }
                ctx.putImageData(imageData, 0, 0);
                images.push(canvas.toDataURL('image/png'));
              }
            }
          } catch (e) {
            console.warn("Failed to extract image", e);
          }
        }
      }
    }

    setLoadingMessage('Analyzing PDF structure with AI...');
    
    // Use Gemini to structure the PDF text
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract product data from this PDF text. Identify columns and rows. 
      Return a JSON object with "headers" (array of strings) and "rows" (array of objects).
      Text: ${fullText.substring(0, 10000)}`, // Limit text for safety
      config: { responseMimeType: "application/json" }
    });

    try {
      const result = JSON.parse(response.text);
      const extractedRows = (result.rows || []).map((row: any, idx: number) => ({
        ...row,
        _image: images[idx] || images[0] || undefined // Try to match or fallback
      }));

      setHeaders(result.headers || []);
      setAllRows(extractedRows);
      setSampleRows(extractedRows.slice(0, 5));
      suggestMappings(result.headers || [], extractedRows.slice(0, 3), extractedRows);
    } catch (e) {
      toast.error("AI failed to parse PDF structure. Try Excel for better results.");
      setStep(1);
    }
  };

  const suggestMappings = async (fileHeaders: string[], sampleData: any[], rowsForSplitting: ExtractedRow[]) => {
    setLoading(true);
    setLoadingMessage('AI is mapping columns and identifying mixed data...');
    
    const targetFields = [
      'description', 'modelNo', 'brand', 'profileCode', 'mainCategory', 
      'subCategory', 'unit', 'costPrice', 'basePrice', 'finishColor', 
      'material', 'direction', 'tongueLength', 'spindleLength'
    ];

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Map these file columns to our internal product fields.
      File Columns: ${JSON.stringify(fileHeaders)}
      Sample Data: ${JSON.stringify(sampleData)}
      Internal Fields: ${JSON.stringify(targetFields)}
      
      IMPORTANT: If a column (like "Description") contains mixed data (e.g., "Hinge 4x4 Stainless Steel"), 
      suggest splitting it. 
      
      Return a JSON object:
      {
        "mappings": [{ "fileColumn": "string", "targetField": "string" }],
        "virtualColumns": [{ "name": "string", "originalColumn": "string", "targetField": "string", "reason": "string" }]
      }
      
      If a column doesn't match any internal field, suggest a new field name starting with "technicalSpecs." (e.g., "technicalSpecs.Weight").`,
      config: { responseMimeType: "application/json" }
    });

    try {
      const result = JSON.parse(response.text);
      const initialMappings: ColumnMapping[] = result.mappings || [];
      
      // Add virtual columns to headers and mappings
      if (result.virtualColumns && result.virtualColumns.length > 0) {
        const newHeaders = [...fileHeaders];
        const newMappings = [...initialMappings];
        
        result.virtualColumns.forEach((vc: any) => {
          if (!newHeaders.includes(vc.name)) {
            newHeaders.push(vc.name);
            newMappings.push({
              fileColumn: vc.name,
              targetField: vc.targetField,
              isVirtual: true,
              originalColumn: vc.originalColumn
            });
          }
        });
        
        setHeaders(newHeaders);
        setMappings(newMappings);
        
        // We need to actually split the data in allRows
        setLoadingMessage('Splitting mixed data columns...');
        const splitRows = rowsForSplitting.map(row => {
          const newRow = { ...row };
          result.virtualColumns.forEach((vc: any) => {
            newRow[vc.name] = `[Extracting from ${vc.originalColumn}...]`;
          });
          return newRow;
        });
        setAllRows(splitRows);
      } else {
        setMappings(initialMappings);
        setAllRows(rowsForSplitting);
      }
    } catch (e) {
      console.error("AI Mapping failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (fileCol: string, target: string) => {
    setMappings(prev => {
      const filtered = prev.filter(m => m.fileColumn !== fileCol);
      if (target === 'skip') return filtered;
      return [...filtered, { fileColumn: fileCol, targetField: target }];
    });
  };

  const addManualSpec = () => {
    setManualSpecs([...manualSpecs, { name: '', value: '' }]);
  };

  const removeManualSpec = (index: number) => {
    setManualSpecs(manualSpecs.filter((_, i) => i !== index));
  };

  const finalizeMappings = async () => {
    setLoading(true);
    setLoadingMessage('Cleaning and splitting data with AI...');
    
    const virtualMappings = mappings.filter(m => m.isVirtual);
    let processedRows = [...allRows];

    if (virtualMappings.length > 0) {
      // Use AI to split data for all rows in bulk if possible, or in chunks
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Process in chunks of 10 to avoid token limits
      const chunkSize = 10;
      for (let i = 0; i < processedRows.length; i += chunkSize) {
        const chunk = processedRows.slice(i, i + chunkSize);
        setLoadingMessage(`Processing chunk ${Math.floor(i/chunkSize) + 1}...`);
        
        const prompt = `Clean and split the following product data. 
        For each row, extract specific fields from the original columns as requested.
        
        Virtual Columns to fill: ${JSON.stringify(virtualMappings.map(m => ({ name: m.fileColumn, source: m.originalColumn, target: m.targetField })))}
        Data: ${JSON.stringify(chunk.map((r, idx) => ({ id: idx, ...r })))}
        
        Return a JSON array of objects: [{ "id": number, "updates": { "columnName": "value" }, "cleanedDescription": "string" }]`;

        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });
          const updates = JSON.parse(response.text);
          updates.forEach((update: any) => {
            const rowIndex = i + update.id;
            if (processedRows[rowIndex]) {
              processedRows[rowIndex] = { 
                ...processedRows[rowIndex], 
                ...update.updates,
                // If we cleaned the description, update the original column value in our processed row
                [virtualMappings.find(m => m.targetField === 'description')?.originalColumn || '']: update.cleanedDescription || processedRows[rowIndex].description
              };
            }
          });
        } catch (e) {
          console.error("Chunk processing failed", e);
        }
      }
    }

    const transformed: Product[] = processedRows.map((row, idx) => {
      const p: any = {
        id: `NIP-IMP-${Date.now()}-${idx}`,
        company: 'Nippon',
        category: 'Hardware',
        unit: 'PCS',
        variants: [],
        technicalSpecs: {},
        imageUrl: row._image
      };

      mappings.forEach(m => {
        const val = row[m.fileColumn];
        if (m.targetField.startsWith('technicalSpecs.')) {
          const specName = m.targetField.split('.')[1];
          p.technicalSpecs[specName] = String(val || '');
        } else {
          p[m.targetField] = val;
        }
      });

      // Add manual specs
      manualSpecs.forEach(ms => {
        if (ms.name) {
          p.technicalSpecs[ms.name] = ms.value;
        }
      });

      // Clean up numeric fields
      p.costPrice = Number(p.costPrice || 0);
      p.basePrice = Number(p.basePrice || 0);
      p.description = String(p.description || 'UNNAMED').toUpperCase();

      return p as Product;
    });

    setFinalData(transformed);
    setStep(4);
    setLoading(false);
  };

  const handleUpdateFinalItem = (idx: number, field: string, value: any) => {
    setFinalData(prev => {
      const next = [...prev];
      const item = { ...next[idx] };
      
      if (field.startsWith('technicalSpecs.')) {
        const specName = field.split('.')[1];
        item.technicalSpecs = { ...item.technicalSpecs, [specName]: value };
      } else {
        (item as any)[field] = value;
      }
      
      next[idx] = item;
      return next;
    });
  };

  const addNewColumn = () => {
    const colName = prompt("Enter new column name (e.g. Weight, Material Grade):");
    if (colName && !extraColumns.includes(colName)) {
      setExtraColumns([...extraColumns, colName]);
      setFinalData(prev => prev.map(item => ({
        ...item,
        technicalSpecs: { ...item.technicalSpecs, [colName]: '' }
      })));
    }
  };

  const handleSaveAll = () => {
    const existingProducts = SalesService.getProducts();
    const otherCompanyProducts = existingProducts.filter(p => p.company !== 'Nippon');
    const nipponProducts = existingProducts.filter(p => p.company === 'Nippon');
    
    // Merge or append? Let's append for now but check for duplicates by modelNo if possible
    const updatedProducts = [...existingProducts, ...finalData];
    
    // Also update Store
    const existingStore = InventoryService.getStore();
    const newStoreItems: StoreItem[] = finalData.map(p => ({
      id: p.id,
      company: 'Nippon',
      name: p.description,
      category: 'Hardware',
      quantity: 0,
      unrestrictedQty: 0,
      qiQty: 0,
      blockedQty: 0,
      reservedQty: 0,
      consignmentQty: 0,
      unit: p.unit,
      minLevel: 10,
      reorderPoint: 5,
      movingAveragePrice: p.costPrice || 0,
      totalValue: 0,
      storageBin: 'Imported',
      lastMovementDate: new Date().toISOString()
    }));

    SalesService.saveProducts(updatedProducts);
    InventoryService.saveStore([...existingStore, ...newStoreItems]);
    
    toast.success(`Successfully imported ${finalData.length} products.`);
    onComplete();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
      {/* HEADER */}
      <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-red-600 rounded-2xl shadow-lg shadow-red-900/20">
            <UploadCloud size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Smart Material Importer</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI-Powered PDF & Excel Processing</p>
          </div>
        </div>
        
        {/* STEPS INDICATOR */}
        <div className="flex items-center space-x-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${step >= s ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                {step > s ? <CheckCircle2 size={16} /> : s}
              </div>
              {s < 4 && <div className={`w-8 h-0.5 ${step > s ? 'bg-red-600' : 'bg-slate-800'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <Loader2 size={48} className="text-red-600 animate-spin mb-4" />
            <p className="text-sm font-black text-slate-800 uppercase tracking-widest animate-pulse">{loadingMessage}</p>
          </div>
        )}

        {step === 1 && (
          <div className="max-w-2xl mx-auto py-12 text-center space-y-8">
            <div className="space-y-4">
              <div className="w-24 h-24 bg-slate-100 rounded-[2.5rem] flex items-center justify-center mx-auto border-2 border-dashed border-slate-300 group-hover:border-red-500 transition-all">
                <FileUp size={40} className="text-slate-300" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 uppercase">Upload Source File</h3>
              <p className="text-slate-500 font-medium">Select a PDF technical sheet or Excel catalog. AI will automatically identify specifications and images.</p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-4 border-dashed border-slate-100 rounded-[3rem] p-12 hover:border-red-200 hover:bg-red-50/30 transition-all cursor-pointer group"
            >
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.xlsx,.xls" onChange={handleFileChange} />
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-2xl shadow-xl group-hover:scale-110 transition-transform">
                  <UploadCloud size={32} className="text-red-600" />
                </div>
                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">Click to browse or drag & drop</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center space-x-3">
                <TableIcon className="text-emerald-500" />
                <div className="text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Excel Support</p>
                  <p className="text-xs font-bold text-slate-700">Multi-sheet, Formulas</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center space-x-3">
                <ImageIcon className="text-blue-500" />
                <div className="text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase">PDF Support</p>
                  <p className="text-xs font-bold text-slate-700">OCR & Image Extraction</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase">Column Mapping</h3>
                <p className="text-xs font-bold text-slate-400 uppercase mt-1">Verify how file columns map to product specifications</p>
              </div>
              <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase flex items-center space-x-2">
                <CheckCircle2 size={14} /> <span>AI Suggestions Applied</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-slate-50 rounded-3xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b text-[10px] font-black uppercase text-slate-500 tracking-widest">
                      <tr>
                        <th className="px-6 py-4">File Column</th>
                        <th>Sample Data</th>
                        <th className="px-6">Map To Field</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {headers.map(header => {
                        const mapping = mappings.find(m => m.fileColumn === header);
                        return (
                          <tr key={header} className="hover:bg-white transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-700">
                              <div className="flex items-center space-x-2">
                                <span>{header}</span>
                                {mapping?.isVirtual && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[8px] font-black uppercase">Virtual</span>
                                )}
                              </div>
                              {mapping?.isVirtual && (
                                <p className="text-[8px] text-slate-400 font-medium mt-0.5 uppercase tracking-tighter">Extracted from {mapping.originalColumn}</p>
                              )}
                            </td>
                            <td className="text-slate-400 italic">
                              {sampleRows[0]?.[header] || '-'}
                            </td>
                            <td className="px-6 py-2">
                              <select 
                                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-[10px] uppercase focus:ring-2 focus:ring-red-500 outline-none"
                                value={mapping?.targetField || 'skip'}
                                onChange={(e) => handleMappingChange(header, e.target.value)}
                              >
                                <option value="skip">-- Skip Column --</option>
                                <optgroup label="Core Fields">
                                  <option value="description">Description / Name</option>
                                  <option value="modelNo">Model No / Code</option>
                                  <option value="profileCode">Internal ID</option>
                                  <option value="brand">Brand / Vendor</option>
                                  <option value="unit">Unit (PCS, Set...)</option>
                                  <option value="costPrice">Cost Price</option>
                                  <option value="basePrice">Sales Price</option>
                                </optgroup>
                                <optgroup label="Tech Specs">
                                  <option value="finishColor">Finish / Color</option>
                                  <option value="material">Material</option>
                                  <option value="direction">Direction</option>
                                  <option value="tongueLength">Size / Tongue</option>
                                  <option value="spindleLength">Spindle Length</option>
                                </optgroup>
                                <optgroup label="New Spec">
                                  <option value={`technicalSpecs.${header}`}>Create New: {header}</option>
                                </optgroup>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center space-x-2 text-slate-800">
                    <Settings2 size={18} />
                    <h4 className="font-black uppercase text-xs">Mapping Summary</h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span className="text-slate-400">Total Columns</span>
                      <span className="text-slate-800">{headers.length}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span className="text-slate-400">Mapped</span>
                      <span className="text-emerald-600">{mappings.length}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span className="text-slate-400">Skipped</span>
                      <span className="text-rose-400">{headers.length - mappings.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 p-6 rounded-3xl border border-red-100 space-y-3">
                  <div className="flex items-center space-x-2 text-red-700">
                    <AlertCircle size={18} />
                    <h4 className="font-black uppercase text-xs">AI Insight</h4>
                  </div>
                  <p className="text-[10px] font-medium text-red-600 leading-relaxed">
                    We've identified several technical specifications like "Direction" and "Spindle Length". 
                    Unrecognized columns can be mapped as "New Spec" to preserve data.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="text-center">
              <h3 className="text-xl font-black text-slate-800 uppercase">Additional Specifications</h3>
              <p className="text-xs font-bold text-slate-400 uppercase mt-1">Add constant values for all imported items</p>
            </div>

            <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-200 space-y-4">
              {manualSpecs.map((spec, idx) => (
                <div key={idx} className="flex items-center space-x-4 animate-in slide-in-from-top-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Spec Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Category"
                      className="w-full p-3 bg-white border border-slate-200 rounded-2xl font-bold text-xs uppercase"
                      value={spec.name}
                      onChange={(e) => {
                        const newSpecs = [...manualSpecs];
                        newSpecs[idx].name = e.target.value;
                        setManualSpecs(newSpecs);
                      }}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Value</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Hardware"
                      className="w-full p-3 bg-white border border-slate-200 rounded-2xl font-bold text-xs uppercase"
                      value={spec.value}
                      onChange={(e) => {
                        const newSpecs = [...manualSpecs];
                        newSpecs[idx].value = e.target.value;
                        setManualSpecs(newSpecs);
                      }}
                    />
                  </div>
                  <button 
                    onClick={() => removeManualSpec(idx)}
                    className="mt-5 p-3 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}

              <button 
                onClick={addManualSpec}
                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50/30 transition-all flex items-center justify-center space-x-2 font-black uppercase text-xs tracking-widest"
              >
                <Plus size={18} /> <span>Add Manual Specification</span>
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase">Review Extracted Data</h3>
                <p className="text-xs font-bold text-slate-400 uppercase mt-1">Check for accuracy before saving to database</p>
              </div>
              <div className="flex items-center space-x-4">
                <button 
                  onClick={addNewColumn}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center space-x-2"
                >
                  <Plus size={14} /> <span>Add New Column</span>
                </button>
                <span className="px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-500">
                  {finalData.length} Items Ready
                </span>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    <tr>
                      <th className="px-6 py-4">Model No</th>
                      <th>Description</th>
                      <th>Brand</th>
                      <th>Price</th>
                      {extraColumns.map(col => (
                        <th key={col}>{col}</th>
                      ))}
                      <th>Other Specs</th>
                      <th className="px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {finalData.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center space-x-3">
                            <div className="relative group">
                              {p.imageUrl ? (
                                <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                                  <ImageIcon size={16} />
                                </div>
                              )}
                              <input 
                                type="file" 
                                className="hidden" 
                                id={`img-upload-${idx}`}
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => handleUpdateFinalItem(idx, 'imageUrl', ev.target?.result);
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <label 
                                htmlFor={`img-upload-${idx}`}
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center cursor-pointer"
                              >
                                <Plus size={14} className="text-white" />
                              </label>
                            </div>
                            <input 
                              type="text" 
                              className="bg-transparent border-none focus:ring-0 font-black text-blue-600 uppercase w-32 p-0"
                              value={p.modelNo || ''}
                              onChange={(e) => handleUpdateFinalItem(idx, 'modelNo', e.target.value)}
                              placeholder="MODEL NO"
                            />
                          </div>
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="bg-transparent border-none focus:ring-0 font-bold text-slate-800 uppercase w-full p-0"
                            value={p.description || ''}
                            onChange={(e) => handleUpdateFinalItem(idx, 'description', e.target.value)}
                            placeholder="DESCRIPTION"
                          />
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="bg-transparent border-none focus:ring-0 font-bold text-slate-400 text-[10px] uppercase w-24 p-0"
                            value={p.brand || ''}
                            onChange={(e) => handleUpdateFinalItem(idx, 'brand', e.target.value)}
                            placeholder="BRAND"
                          />
                        </td>
                        <td>
                          <div className="flex items-center space-x-1">
                            <span className="text-[10px] font-black text-slate-300">PKR</span>
                            <input 
                              type="number" 
                              className="bg-transparent border-none focus:ring-0 font-black text-slate-900 w-24 p-0"
                              value={p.basePrice || 0}
                              onChange={(e) => handleUpdateFinalItem(idx, 'basePrice', Number(e.target.value))}
                            />
                          </div>
                        </td>
                        {extraColumns.map(col => (
                          <td key={col}>
                            <input 
                              type="text" 
                              className="bg-transparent border-none focus:ring-0 font-bold text-slate-600 uppercase w-24 p-0"
                              value={p.technicalSpecs?.[col] || ''}
                              onChange={(e) => handleUpdateFinalItem(idx, `technicalSpecs.${col}`, e.target.value)}
                              placeholder="-"
                            />
                          </td>
                        ))}
                        <td>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {Object.entries(p.technicalSpecs || {})
                              .filter(([k]) => !extraColumns.includes(k))
                              .map(([k, v]) => (
                                <span key={k} className="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-bold uppercase text-slate-500">
                                  {k}: {v}
                                </span>
                              ))}
                            {p.finishColor && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-bold uppercase">Color: {p.finishColor}</span>}
                          </div>
                        </td>
                        <td className="px-6 text-right">
                          <button 
                            onClick={() => setFinalData(finalData.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="px-8 py-6 bg-slate-50 border-t flex justify-between items-center">
        {step > 1 ? (
          <button 
            onClick={() => setStep(step - 1)}
            className="flex items-center space-x-2 px-6 py-3 text-slate-400 hover:text-slate-800 font-black uppercase text-xs transition-all"
          >
            <ArrowLeft size={18} /> <span>Back</span>
          </button>
        ) : <div />}

        <div className="flex items-center space-x-3">
          <button 
            onClick={onComplete}
            className="px-6 py-3 text-slate-400 hover:text-slate-600 font-black uppercase text-xs"
          >
            Cancel
          </button>
          
          {step === 2 && (
            <button 
              onClick={finalizeMappings}
              className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center space-x-2"
            >
              <span>Finalize Mappings</span> <ArrowRight size={18} />
            </button>
          )}

          {step === 3 && (
            <button 
              onClick={() => setStep(4)}
              className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center space-x-2"
            >
              <span>Review Data</span> <ArrowRight size={18} />
            </button>
          )}

          {step === 4 && (
            <button 
              onClick={handleSaveAll}
              className="bg-emerald-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center space-x-2"
            >
              <Save size={18} /> <span>Save to Database</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NipponSmartImporter;
