import { EmployeeDoc, DocType, DocStatus } from '../types/hr';
import { safeParse, safeSave } from '../../shared/services/utils';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import { toast } from 'sonner';

// ── Constants ───────────────────────────────────────────────────────
const SUPABASE_TABLE = 'employee_docs';
const STORAGE_BUCKET = 'employee-docs';
const LOCAL_CACHE_KEY = 'gtk_erp_employee_docs';  // offline cache only

// ── Document Type Metadata ──────────────────────────────────────────
export const DOC_TYPE_META: Record<DocType, { label: string; icon: string; hasExpiry: boolean; accept: string }> = {
  photo:                { label: 'Photo',              icon: '📷', hasExpiry: false, accept: 'image/*' },
  cnic_front:           { label: 'CNIC (Front)',       icon: '🪪', hasExpiry: true,  accept: 'image/*,.pdf' },
  cnic_back:            { label: 'CNIC (Back)',        icon: '🪪', hasExpiry: true,  accept: 'image/*,.pdf' },
  police_verification:  { label: 'Police Verification', icon: '🔒', hasExpiry: true,  accept: 'image/*,.pdf' },
  job_letter:           { label: 'Job Letter',         icon: '📄', hasExpiry: false, accept: '.pdf,image/*' },
  contract:             { label: 'Contract',           icon: '📋', hasExpiry: true,  accept: '.pdf,image/*' },
  other:                { label: 'Other',              icon: '📎', hasExpiry: false, accept: '*' },
};

// ── Helpers ─────────────────────────────────────────────────────────
const computeStatus = (expiryDate: string | null): DocStatus => {
  if (!expiryDate) return 'valid';
  return expiryDate < new Date().toISOString().split('T')[0] ? 'expired' : 'valid';
};

const rowToDoc = (r: any): EmployeeDoc => ({
  id: r.id,
  employeeId: r.employee_id,
  docType: r.doc_type,
  fileName: r.file_name,
  fileUrl: r.file_url,
  expiryDate: r.expiry_date || null,
  uploadedAt: r.uploaded_at,
  status: computeStatus(r.expiry_date),
});

const docToRow = (d: EmployeeDoc) => ({
  id: d.id,
  employee_id: d.employeeId,
  doc_type: d.docType,
  file_name: d.fileName,
  file_url: d.fileUrl,
  expiry_date: d.expiryDate || null,
  uploaded_at: d.uploadedAt,
  status: computeStatus(d.expiryDate),
});

// ── Update local cache after any Supabase operation ─────────────────
const updateLocalCache = (docs: EmployeeDoc[]) => {
  safeSave(LOCAL_CACHE_KEY, docs);
};

// ── Compress image before uploading ─────────────────────────────────
const compressImage = (file: File, maxWidth = 800, quality = 0.7): Promise<Blob> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(blob || file),
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = reader.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

// ════════════════════════════════════════════════════════════════════
// SERVICE — Supabase-primary, localStorage cache fallback
// ════════════════════════════════════════════════════════════════════
export const EmployeeDocService = {

  // ── Get docs for an employee ──────────────────────────────────────
  getByEmployee: async (employeeId: string): Promise<EmployeeDoc[]> => {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .eq('employee_id', employeeId);

      if (error) throw error;

      const docs = (data || []).map(rowToDoc);
      // Update local cache for this employee
      const allCache: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
      const otherDocs = allCache.filter(d => d.employeeId !== employeeId);
      updateLocalCache([...otherDocs, ...docs]);
      return docs;
    } catch (err) {
      console.warn('[DocService] Supabase read failed, using cache:', err);
      const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
      return cached
        .filter(d => d.employeeId === employeeId)
        .map(d => ({ ...d, status: computeStatus(d.expiryDate) }));
    }
  },

  // ── Get all docs (for dashboard alerts) ───────────────────────────
  getAll: async (): Promise<EmployeeDoc[]> => {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*');

      if (error) throw error;

      const docs = (data || []).map(rowToDoc);
      updateLocalCache(docs);
      return docs;
    } catch (err) {
      console.warn('[DocService] Supabase read failed, using cache:', err);
      const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
      return cached.map(d => ({ ...d, status: computeStatus(d.expiryDate) }));
    }
  },

  // ── Get expiring documents (within N days) ────────────────────────
  getExpiring: async (withinDays = 30): Promise<EmployeeDoc[]> => {
    const today = new Date().toISOString().split('T')[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .not('expiry_date', 'is', null)
        .gte('expiry_date', today)
        .lte('expiry_date', cutoffStr);

      if (error) throw error;
      return (data || []).map(rowToDoc);
    } catch {
      const all = await EmployeeDocService.getAll();
      return all.filter(d => d.expiryDate && d.expiryDate >= today && d.expiryDate <= cutoffStr);
    }
  },

  // ── Get expired documents ─────────────────────────────────────────
  getExpired: async (): Promise<EmployeeDoc[]> => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .not('expiry_date', 'is', null)
        .lt('expiry_date', today);

      if (error) throw error;
      return (data || []).map(rowToDoc);
    } catch {
      const all = await EmployeeDocService.getAll();
      return all.filter(d => d.status === 'expired');
    }
  },

  // ── Get missing required docs ─────────────────────────────────────
  getMissing: async (employeeId: string): Promise<DocType[]> => {
    const required: DocType[] = ['photo', 'cnic_front', 'cnic_back', 'police_verification', 'job_letter'];
    const existing = await EmployeeDocService.getByEmployee(employeeId);
    return required.filter(dt => !existing.some(d => d.docType === dt));
  },

  // ── Upload document — Supabase Storage + DB ───────────────────────
  upload: async (
    employeeId: string,
    company: string,
    employeeCode: string,
    docType: DocType,
    file: File,
    expiryDate?: string
  ): Promise<EmployeeDoc> => {
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${docType}_${timestamp}.${ext}`;
    const storagePath = `${company}/${employeeCode}/${fileName}`;

    // ── Step 1: Compress image if needed ─────────────────────────────
    let uploadFile: File | Blob = file;
    if (file.type.startsWith('image/')) {
      const maxW = docType === 'photo' ? 400 : 800;
      uploadFile = await compressImage(file, maxW, 0.7);
    }

    // ── Step 2: Upload to Supabase Storage ──────────────────────────
    let fileUrl = '';
    try {
      // Delete existing file of same doc type first
      const { data: existingFiles } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(`${company}/${employeeCode}`, { search: docType });

      if (existingFiles && existingFiles.length > 0) {
        const toDelete = existingFiles
          .filter(f => f.name.startsWith(docType))
          .map(f => `${company}/${employeeCode}/${f.name}`);
        if (toDelete.length > 0) {
          await supabase.storage.from(STORAGE_BUCKET).remove(toDelete);
        }
      }

      // Upload new file
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, uploadFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      fileUrl = urlData.publicUrl;
      Logger.action('Docs', 'UPLOAD', `${fileName} → Supabase Storage`);
    } catch (err: any) {
      console.error('[DocService] Storage upload failed:', err);
      toast.error(`File upload failed: ${err?.message || 'Unknown error'}`);
      throw err;
    }

    // ── Step 3: Save metadata to Supabase DB ────────────────────────
    const doc: EmployeeDoc = {
      id: `doc_${timestamp}`,
      employeeId,
      docType,
      fileName,
      fileUrl,
      expiryDate: expiryDate || null,
      uploadedAt: new Date().toISOString().split('T')[0],
      status: 'valid',
    };

    try {
      // Delete existing doc of same type for same employee
      await supabase
        .from(SUPABASE_TABLE)
        .delete()
        .eq('employee_id', employeeId)
        .eq('doc_type', docType);

      // Insert new doc
      const { error: dbError } = await supabase
        .from(SUPABASE_TABLE)
        .insert(docToRow(doc));

      if (dbError) throw dbError;

      // Update local cache
      const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
      const filtered = cached.filter(d => !(d.employeeId === employeeId && d.docType === docType));
      updateLocalCache([...filtered, doc]);

      Logger.action('Docs', 'SAVE', `${docType} metadata saved for ${employeeCode}`);
      return doc;
    } catch (err: any) {
      console.error('[DocService] DB save failed:', err);
      toast.error(`Metadata save failed: ${err?.message || 'Unknown error'}`);
      throw err;
    }
  },

  // ── Delete document ───────────────────────────────────────────────
  delete: async (docId: string): Promise<void> => {
    try {
      // Get doc info first
      const { data: docRow, error: fetchErr } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .eq('id', docId)
        .single();

      if (fetchErr) throw fetchErr;

      // Delete from Storage
      if (docRow?.file_url) {
        try {
          // Extract path from public URL
          const url = new URL(docRow.file_url);
          const pathParts = url.pathname.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`);
          if (pathParts[1]) {
            await supabase.storage.from(STORAGE_BUCKET).remove([decodeURIComponent(pathParts[1])]);
          }
        } catch (storageErr) {
          console.warn('[DocService] Storage delete failed:', storageErr);
        }
      }

      // Delete from DB
      const { error: dbErr } = await supabase
        .from(SUPABASE_TABLE)
        .delete()
        .eq('id', docId);

      if (dbErr) throw dbErr;

      // Update local cache
      const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
      updateLocalCache(cached.filter(d => d.id !== docId));

      Logger.action('Docs', 'DELETE', `Document ${docId} deleted from Supabase`);
    } catch (err: any) {
      console.error('[DocService] Delete failed:', err);
      toast.error(`Delete failed: ${err?.message || 'Unknown error'}`);
      throw err;
    }
  },

  // ── Update expiry date ────────────────────────────────────────────
  updateExpiry: async (docId: string, expiryDate: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from(SUPABASE_TABLE)
        .update({
          expiry_date: expiryDate,
          status: computeStatus(expiryDate),
        })
        .eq('id', docId);

      if (error) throw error;

      // Update local cache
      const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
      updateLocalCache(cached.map(d => d.id === docId ? { ...d, expiryDate, status: computeStatus(expiryDate) } : d));
    } catch (err: any) {
      console.error('[DocService] Expiry update failed:', err);
      toast.error(`Update failed: ${err?.message || 'Unknown error'}`);
    }
  },

  // ── Get photo URL (quick access for avatars) ──────────────────────
  // This uses local cache for speed — no await needed in lists
  getPhotoUrl: (employeeId: string): string | null => {
    const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
    const photo = cached.find(d => d.employeeId === employeeId && d.docType === 'photo');
    return photo?.fileUrl || null;
  },

  // ── Document completeness score (sync version for lists) ──────────
  getCompleteness: (employeeId: string): number => {
    const required: DocType[] = ['photo', 'cnic_front', 'cnic_back', 'police_verification', 'job_letter'];
    const cached: EmployeeDoc[] = safeParse(LOCAL_CACHE_KEY);
    const empDocs = cached.filter(d => d.employeeId === employeeId);
    const found = required.filter(dt => empDocs.some(d => d.docType === dt));
    return Math.round((found.length / required.length) * 100);
  },

  // ── Sync cache from Supabase (call on app load) ───────────────────
  syncCache: async (): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*');

      if (error) throw error;
      updateLocalCache((data || []).map(rowToDoc));
      Logger.action('Docs', 'CACHE_SYNC', `${data?.length || 0} docs cached`);
    } catch (err) {
      console.warn('[DocService] Cache sync failed:', err);
    }
  },
};
