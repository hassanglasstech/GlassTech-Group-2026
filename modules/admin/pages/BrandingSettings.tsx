/**
 * BrandingSettings.tsx — Sprint 33
 *
 * Admin page that owns the per-company branding row used by every
 * customer-facing print (PrintHeader + PrintFooter). One company at
 * a time; switcher at the top.
 *
 * Sections:
 *   1. Identity   — legal name, NTN, STRN, CNIC, addresses, contact
 *   2. Logo       — file picker (PNG/SVG), preview, clear
 *   3. Bank       — name, branch, IBAN, account #, SWIFT, account title
 *   4. Signatures — multi-line authorised-signatory block
 *   5. T&C        — six tabbed text-areas (Quotation / Invoice / DC /
 *                   Service Order / Credit Note / GRN)
 *   6. Toggles    — show logo, show bank on invoice, show QR (future)
 *
 * Live preview pane on the right shows the PrintHeader + PrintFooter
 * rendered with the current edits so operators see what their changes
 * will look like before saving.
 *
 * Mounted at /admin/branding — admin / owner / hassan / glassco_admin.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/authStore';
import { useAppStore } from '@/modules/shared/store/appStore';
import { BrandingService, CompanyBranding } from '@/modules/shared/services/brandingService';
import PrintHeader from '@/modules/shared/components/prints/PrintHeader';
import PrintFooter from '@/modules/shared/components/prints/PrintFooter';
import { toast } from 'sonner';
import {
  Building2, Upload, X, Save, FileText, Banknote, AlertTriangle,
  ImageIcon, Settings, Eye,
} from 'lucide-react';

const COMPANIES = ['Glassco', 'GTK', 'GTI', 'Nippon', 'Factory'] as const;
const TERMS_TABS = [
  { key: 'termsQuotation',       label: 'Quotation' },
  { key: 'termsInvoice',         label: 'Tax Invoice' },
  { key: 'termsDeliveryChallan', label: 'Delivery Challan' },
  { key: 'termsServiceOrder',    label: 'Service Order' },
  { key: 'termsCreditNote',      label: 'Credit Note' },
  { key: 'termsGrn',             label: 'GRN' },
] as const;

const MAX_LOGO_BYTES = 150 * 1024;     // 150 KB; bigger files explode the JSONB blob

const BrandingSettings: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const appCompany = useAppStore(s => s.selectedCompany) as string;

  const ALLOWED = new Set(['super_admin', 'owner', 'hassan', 'admin', 'glassco_admin']);
  if (!user) return <Navigate to="/" replace/>;
  if (!ALLOWED.has(user.role || '')) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3"/>
          <p className="text-sm font-bold text-slate-700">Branding Settings requires admin / owner role.</p>
        </div>
      </div>
    );
  }

  const [company, setCompany] = useState<string>(appCompany || 'Glassco');
  const [data, setData] = useState<CompanyBranding | null>(null);
  const [activeTab, setActiveTab] = useState<typeof TERMS_TABS[number]['key']>('termsInvoice');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const b = await BrandingService.loadBranding(company);
    setData(b);
  }, [company]);

  useEffect(() => { reload(); }, [reload]);

  const handleField = (k: keyof CompanyBranding, v: any) => {
    if (!data) return;
    setData({ ...data, [k]: v });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    if (!/^image\/(png|jpeg|jpg|svg\+xml|webp)$/.test(file.type)) {
      toast.error('Logo must be PNG / JPEG / SVG / WebP.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(`Logo too large (${Math.round(file.size / 1024)} KB). Max ${MAX_LOGO_BYTES / 1024} KB. Compress at tinypng.com or similar.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      handleField('logoDataUrl', url);
      toast.success(`Logo loaded (${Math.round(file.size / 1024)} KB). Click Save to persist.`);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    const res = await BrandingService.saveBranding(data);
    setSaving(false);
    if (res.ok) toast.success(`Branding for ${company} saved.`);
    else toast.error(`Save failed: ${res.error}`);
  };

  if (!data) {
    return <div className="p-12 text-center text-slate-400 italic font-bold">Loading branding for {company}…</div>;
  }

  return (
    <div className="space-y-5 p-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-blue-800 text-white p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24}/>
          <div>
            <h1 className="text-xl font-black uppercase">Print Branding &amp; Compliance</h1>
            <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest mt-0.5">
              Per-company letterhead, NTN/STRN, bank details, T&amp;C blocks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={company}
            onChange={e => setCompany(e.target.value)}
            className="bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-xl px-3 py-2 text-sm font-black"
          >
            {COMPANIES.map(c => <option key={c} value={c} className="text-slate-900">{c}</option>)}
          </select>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-black uppercase flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={14}/> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── LEFT: form ── */}
        <div className="space-y-4">

          {/* Identity */}
          <Section title="Identity" icon={<Building2 size={14}/>}>
            <Field label="Legal Name *" value={data.legalName} onChange={v => handleField('legalName', v)}/>
            <div className="grid grid-cols-2 gap-3">
              <Field label="NTN (National Tax #)" value={data.ntn}  onChange={v => handleField('ntn', v)}  mono placeholder="e.g. 1234567-8"/>
              <Field label="STRN (Sales Tax Reg #)" value={data.strn} onChange={v => handleField('strn', v)} mono placeholder="e.g. 32-12-3456-789-12"/>
            </div>
            <Field label="CNIC (sole proprietor)" value={data.cnic} onChange={v => handleField('cnic', v)} mono optional/>
            <Field label="Address Line 1" value={data.addressLine1} onChange={v => handleField('addressLine1', v)}/>
            <Field label="Address Line 2" value={data.addressLine2} onChange={v => handleField('addressLine2', v)} optional/>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={data.city} onChange={v => handleField('city', v)}/>
              <Field label="Country" value={data.country} onChange={v => handleField('country', v)}/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Phone"   value={data.phone}   onChange={v => handleField('phone', v)}/>
              <Field label="Email"   value={data.email}   onChange={v => handleField('email', v)}/>
              <Field label="Website" value={data.website} onChange={v => handleField('website', v)}/>
            </div>
          </Section>

          {/* Logo */}
          <Section title="Logo" icon={<ImageIcon size={14}/>}>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center bg-slate-50 shrink-0">
                {data.logoDataUrl
                  ? <img src={data.logoDataUrl} alt="Logo preview" className="w-full h-full object-contain p-1"/>
                  : <ImageIcon size={28} className="text-slate-300"/>
                }
              </div>
              <div className="flex-1 space-y-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden"/>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-slate-800 flex items-center gap-2"
                >
                  <Upload size={12}/> Upload PNG / SVG
                </button>
                {data.logoDataUrl && (
                  <button
                    onClick={() => handleField('logoDataUrl', '')}
                    className="ml-2 bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-rose-100 flex items-center gap-2"
                  >
                    <X size={12}/> Clear
                  </button>
                )}
                <p className="text-[10px] text-slate-400 font-bold">
                  Max 150 KB · transparent PNG or SVG recommended · 1:1 ratio renders best.
                </p>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mt-2">
                  <input type="checkbox" checked={data.showLogo} onChange={e => handleField('showLogo', e.target.checked)}/>
                  Show logo on prints
                </label>
              </div>
            </div>
          </Section>

          {/* Bank */}
          <Section title="Bank Details" icon={<Banknote size={14}/>}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank Name"      value={data.bankName}         onChange={v => handleField('bankName', v)}/>
              <Field label="Branch"         value={data.bankBranch}       onChange={v => handleField('bankBranch', v)}/>
              <Field label="Account Title"  value={data.bankAccountTitle} onChange={v => handleField('bankAccountTitle', v)}/>
              <Field label="Account #"      value={data.bankAccountNo}    onChange={v => handleField('bankAccountNo', v)} mono/>
              <Field label="IBAN"           value={data.bankIban}         onChange={v => handleField('bankIban', v)}     mono/>
              <Field label="SWIFT"          value={data.bankSwift}        onChange={v => handleField('bankSwift', v)}    mono optional/>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mt-2">
              <input type="checkbox" checked={data.showBankOnInvoice} onChange={e => handleField('showBankOnInvoice', e.target.checked)}/>
              Show bank details on tax invoices &amp; receipts
            </label>
          </Section>

          {/* Signatures */}
          <Section title="Signature Block" icon={<Settings size={14}/>}>
            <textarea
              rows={3}
              value={data.signatureBlock}
              onChange={e => handleField('signatureBlock', e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium resize-none"
              placeholder={'Authorised Signatory\nName: ____________\nDate: ____________'}
            />
            <p className="text-[10px] text-slate-400 font-bold">Default signature line. Individual prints can override with custom labels (e.g. "Customer Signature").</p>
          </Section>

          {/* T&C tabs */}
          <Section title="Terms & Conditions" icon={<FileText size={14}/>}>
            <div className="flex gap-1 flex-wrap mb-3">
              {TERMS_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${activeTab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              value={(data[activeTab] as string) || ''}
              onChange={e => handleField(activeTab, e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium resize-none"
              placeholder={`Terms for ${TERMS_TABS.find(t => t.key === activeTab)?.label}…\n\n• Payment due within 30 days\n• Goods once sold are non-returnable\n• Disputes subject to Karachi jurisdiction`}
            />
            <p className="text-[10px] text-slate-400 font-bold">Plain text. Newlines preserved on prints.</p>
          </Section>
        </div>

        {/* ── RIGHT: live preview ── */}
        <div className="lg:sticky lg:top-4 self-start space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Eye size={12}/> Live print preview
          </p>
          <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6">
              <PrintHeader
                company={company}
                docTitle="TAX INVOICE"
                docNumber={`GT-INV-${(company || '').slice(0, 3).toUpperCase()}-PREVIEW`}
                docMeta={[
                  { label: 'Date', value: new Date().toISOString().slice(0, 10) },
                  { label: 'Due',  value: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) },
                ]}
                brandingOverride={data}
              />
              <div className="text-xs text-slate-400 italic py-8 text-center border border-dashed border-slate-200 rounded my-3">
                · Invoice line items render here ·
              </div>
              <PrintFooter
                company={company}
                termsKey={activeTab}
                signatureLines={['Prepared By', 'Customer Signature']}
                footerNote={`This is a system-generated ${TERMS_TABS.find(t => t.key === activeTab)?.label || 'document'}. Computer-printed; signature optional.`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 space-y-3">
    <p className="text-xs font-black uppercase tracking-widest text-slate-600 flex items-center gap-2 border-b border-slate-100 pb-2">
      {icon}{title}
    </p>
    {children}
  </div>
);

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  mono?: boolean; optional?: boolean; placeholder?: string;
}> = ({ label, value, onChange, mono, optional, placeholder }) => (
  <div>
    <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">
      {label}{optional && <span className="text-slate-300 ml-1">(optional)</span>}
    </label>
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm ${mono ? 'font-mono' : 'font-medium'} focus:border-blue-500 focus:outline-none`}
    />
  </div>
);

export default BrandingSettings;
