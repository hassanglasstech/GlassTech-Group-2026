import React, { useRef, useState } from 'react';
import { Upload, Trash2, FileImage, AlertCircle } from 'lucide-react';

interface Props {
    attachments: string[];
    onUpdate: (attachments: string[]) => void;
    maxCount?: number;
    maxSizeMB?: number;
}

const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

export const AttachmentsTab: React.FC<Props> = ({ attachments, onUpdate, maxCount = 5, maxSizeMB = 3 }) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [error, setError] = useState<string>('');
    const [busy, setBusy] = useState(false);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setError('');
        setBusy(true);
        try {
            const remaining = maxCount - attachments.length;
            if (remaining <= 0) {
                setError(`Maximum ${maxCount} attachments allowed`);
                return;
            }
            const toProcess = Array.from(files).slice(0, remaining);
            const maxBytes = maxSizeMB * 1024 * 1024;
            const newDataUrls: string[] = [];
            for (const file of toProcess) {
                if (!file.type.startsWith('image/')) {
                    setError(`"${file.name}" is not an image`);
                    continue;
                }
                if (file.size > maxBytes) {
                    setError(`"${file.name}" exceeds ${maxSizeMB}MB limit`);
                    continue;
                }
                const dataUrl = await readFileAsDataUrl(file);
                newDataUrls.push(dataUrl);
            }
            if (newDataUrls.length > 0) {
                onUpdate([...attachments, ...newDataUrls]);
            }
        } finally {
            setBusy(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeAttachment = (idx: number) => {
        const next = [...attachments];
        next.splice(idx, 1);
        onUpdate(next);
    };

    const pickFile = () => fileInputRef.current?.click();

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">Reference Attachments</div>
                    <h2 className="text-lg font-bold text-slate-800 mt-1">Client Drawings, Photos & Documents</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Yeh attachments quotation, job card aur sales order ke saath print honge. Max {maxCount} images, {maxSizeMB}MB per file.
                    </p>
                </div>

                {/* Upload Zone */}
                <div
                    onClick={pickFile}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                        e.preventDefault();
                        handleFiles(e.dataTransfer.files);
                    }}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${busy ? 'border-blue-300 bg-blue-50/50 opacity-60' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/30'}`}
                >
                    <Upload className="mx-auto text-slate-400 mb-3" size={36} />
                    <div className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                        {busy ? 'Uploading…' : 'Click or Drag Images Here'}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium mt-1">
                        PNG, JPG, WebP · {attachments.length}/{maxCount} uploaded
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => handleFiles(e.target.files)}
                    />
                </div>

                {error && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] font-bold text-rose-700">
                        <AlertCircle size={14} /> {error}
                    </div>
                )}

                {/* Thumbnails Grid */}
                {attachments.length > 0 && (
                    <div className="mt-6">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                            Uploaded ({attachments.length})
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {attachments.map((src, idx) => (
                                <div key={idx} className="relative group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="aspect-video bg-slate-100 flex items-center justify-center">
                                        <img src={src} alt={`Attachment ${idx + 1}`} className="w-full h-full object-contain" />
                                    </div>
                                    <div className="px-3 py-2 flex items-center justify-between bg-slate-50 border-t border-slate-200">
                                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-600">
                                            <FileImage size={12} /> Attach #{idx + 1}
                                        </div>
                                        <button
                                            onClick={() => removeAttachment(idx)}
                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                                            title="Remove"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AttachmentsTab;
