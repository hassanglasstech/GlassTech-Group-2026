import React, { useState, useEffect, useRef, useCallback } from 'react';
import { EmployeeDoc, DocType, Employee } from '../types/hr';
import { EmployeeDocService, DOC_TYPE_META } from '../services/employeeDocService';
import { Upload, Trash2, Calendar, AlertTriangle, CheckCircle2, Clock, Eye, X, FileText, Camera, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentFolderProps {
  employee: Employee;
  onPhotoChange?: (url: string) => void;
}

const DocumentFolder: React.FC<DocumentFolderProps> = ({ employee, onPhotoChange }) => {
  const [docs, setDocs] = useState<EmployeeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [expiryInput, setExpiryInput] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadType, setActiveUploadType] = useState<DocType>('photo');

  const refreshDocs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await EmployeeDocService.getByEmployee(employee.id);
      setDocs(result);
    } catch (err) {
      console.error('[DocFolder] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  // Sync versions for display (use cache for speed)
  const completeness = EmployeeDocService.getCompleteness(employee.id);
  const requiredTypes: DocType[] = ['photo', 'cnic_front', 'cnic_back', 'police_verification', 'job_letter'];
  const missingDocs = requiredTypes.filter(dt => !docs.some(d => d.docType === dt));

  const triggerUpload = (docType: DocType) => {
    setActiveUploadType(docType);
    if (fileInputRef.current) {
      fileInputRef.current.accept = DOC_TYPE_META[docType].accept;
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB');
      return;
    }

    setUploading(activeUploadType);
    try {
      const doc = await EmployeeDocService.upload(
        employee.id,
        employee.company,
        employee.work.employeeCode,
        activeUploadType,
        file,
        expiryInput[activeUploadType]
      );

      if (activeUploadType === 'photo' && onPhotoChange) {
        onPhotoChange(doc.fileUrl);
      }

      await refreshDocs();
      toast.success(`${DOC_TYPE_META[activeUploadType].label} uploaded to Supabase`);
    } catch (err) {
      // Error already toasted by service
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (doc: EmployeeDoc) => {
    if (!confirm(`Delete ${DOC_TYPE_META[doc.docType].label}?`)) return;
    try {
      await EmployeeDocService.delete(doc.id);
      await refreshDocs();
      toast.success('Document deleted');
    } catch {
      // Error already toasted
    }
  };

  const handleExpiryUpdate = async (docId: string, date: string) => {
    await EmployeeDocService.updateExpiry(docId, date);
    await refreshDocs();
    toast.success('Expiry date updated');
  };

  const getStatusBadge = (doc: EmployeeDoc) => {
    if (doc.status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-red-50 text-red-700 border border-red-100">
          <AlertTriangle size={10} /> Expired
        </span>
      );
    }
    if (doc.expiryDate) {
      const daysLeft = Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-100">
            <Clock size={10} /> {daysLeft}d left
          </span>
        );
      }
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
        <CheckCircle2 size={10} /> Valid
      </span>
    );
  };

  const isImage = (url: string) => url.startsWith('data:image/') || /\.(jpg|jpeg|png|gif|webp)/i.test(url);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={24} className="animate-spin text-slate-400" />
        <span className="ml-3 text-sm font-bold text-slate-400">Loading documents from Supabase...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

      {/* Completeness Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center space-x-3">
            <FileText size={18} className="text-slate-400" />
            <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Document completeness</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-100">Supabase</span>
          </div>
          <span className={`text-lg font-black ${completeness === 100 ? 'text-emerald-600' : completeness >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {completeness}%
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${completeness === 100 ? 'bg-emerald-500' : completeness >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${completeness}%` }}
          ></div>
        </div>
        {missingDocs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="text-[10px] font-bold text-red-600 uppercase mr-1">Missing:</span>
            {missingDocs.map(dt => (
              <button key={dt} onClick={() => triggerUpload(dt)}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 transition-colors cursor-pointer">
                {DOC_TYPE_META[dt].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(DOC_TYPE_META) as DocType[]).map(docType => {
          const meta = DOC_TYPE_META[docType];
          const doc = docs.find(d => d.docType === docType);
          const isUploading = uploading === docType;

          return (
            <div key={docType}
              className={`rounded-2xl border overflow-hidden transition-all ${doc ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-dashed border-slate-300'}`}>
              <div className="px-4 py-3 flex justify-between items-center border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">{meta.icon}</span>
                  <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{meta.label}</span>
                </div>
                {doc && getStatusBadge(doc)}
              </div>

              <div className="p-4">
                {doc ? (
                  <div className="space-y-3">
                    {isImage(doc.fileUrl) && (
                      <div className="w-full h-32 rounded-xl bg-slate-100 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setPreviewUrl(doc.fileUrl)}>
                        <img src={doc.fileUrl} alt={meta.label} className="w-full h-full object-cover" />
                      </div>
                    )}
                    {!isImage(doc.fileUrl) && (
                      <div className="w-full h-20 rounded-xl bg-slate-100 flex items-center justify-center">
                        <FileText size={32} className="text-slate-300" />
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-400">Uploaded: {doc.uploadedAt}</span>
                      <div className="flex items-center gap-1">
                        {isImage(doc.fileUrl) && (
                          <button onClick={() => setPreviewUrl(doc.fileUrl)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Preview"><Eye size={14} /></button>
                        )}
                        <button onClick={() => triggerUpload(docType)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Replace"><RefreshCw size={14} /></button>
                        <button onClick={() => handleDelete(doc)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {meta.hasExpiry && (
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-slate-400" />
                        <input type="date"
                          className="flex-1 text-[11px] font-bold bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg outline-none focus:ring-1 focus:ring-blue-400"
                          value={doc.expiryDate || ''}
                          onChange={e => handleExpiryUpdate(doc.id, e.target.value)} />
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => triggerUpload(docType)} disabled={isUploading}
                    className="w-full py-6 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-blue-600 transition-colors group">
                    {isUploading ? (
                      <RefreshCw size={24} className="animate-spin" />
                    ) : docType === 'photo' ? (
                      <Camera size={24} className="group-hover:scale-110 transition-transform" />
                    ) : (
                      <Upload size={24} className="group-hover:scale-110 transition-transform" />
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {isUploading ? 'Uploading to Supabase...' : `Upload ${meta.label}`}
                    </span>
                    {meta.hasExpiry && !isUploading && (
                      <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <span className="text-[9px] font-bold text-slate-400">Expiry:</span>
                        <input type="date"
                          className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 text-slate-600"
                          value={expiryInput[docType] || ''}
                          onChange={e => setExpiryInput(prev => ({ ...prev, [docType]: e.target.value }))}
                          onClick={e => e.stopPropagation()} />
                      </div>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Image Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[600]"
          onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 bg-white text-slate-600 p-2 rounded-full shadow-xl hover:bg-slate-100 transition-colors z-10">
              <X size={20} />
            </button>
            <img src={previewUrl} alt="Document preview" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(DocumentFolder);
