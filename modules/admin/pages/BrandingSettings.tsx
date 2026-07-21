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
import { BrandingService, CompanyBranding, LOGO_CANVAS_HINT } from '@/modules/shared/services/brandingService';
import { trimImagePadding } from '@/modules/shared/utils/imageTrim';
import { NIPPON_DEFAULT_TERMS } from '@/modules/nippon/constants/nipponCompanyInfo';
import PrintHeader from '@/modules/shared/components/prints/PrintHeader';
import PrintFooter from '@/modules/shared/components/prints/PrintFooter';
import { toast } from 'sonner';
import {
  Building2, Upload, X, Save, FileText, Banknote, AlertTriangle,
  ImageIcon, Settings, Eye,
} from 'lucide-react';

// Branding is scoped to the active company (sidebar switcher) — no all-companies picker.
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

  // Scoped to the ACTIVE company (sidebar switcher). To edit a different company's
  // branding, switch company in the sidebar — no all-companies dropdown here.
  const company = appCompany || 'Glassco';
  const [data, setData] = useState<CompanyBranding | null>(null);
  const [activeTab, setActiveTab] = useState<typeof TERMS_TABS[number]['key']>('termsInvoice');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const b = await BrandingService.loadBranding(company);
    // Seed the footer T&C with the current defaults when blank, so the terms that
    // print today are visible (and editable) here instead of an empty box.
    if (company === 'Nippon') {
      if (!(b.termsQuotation || '').trim()) b.termsQuotation = NIPPON_DEFAULT_TERMS.quotation;
      if (!(b.termsInvoice   || '').trim()) b.termsInvoice   = NIPPON_DEFAULT_TERMS.salesOrder;
    }
    setData(b);
  }, [company]);

  useEffect(() => { reload(); }, [reload]);

  // Guards placed after hooks to keep hook order stable (react-hooks/rules-of-hooks)
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

  const handleField = (k: keyof CompanyBranding, v: any) => {
    if (!data) return;
    setData({ ...data, [k]: v });
  };

  const uploadLogoTo = (field: 'logoDataUrl' | 'logoGlasstechDataUrl' | 'logoKinlongDataUrl' | 'catalogueQrDataUrl') =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      reader.onload = async () => {
        const raw = String(reader.result || '');
        // Logos usually ship on a padded square canvas; the print sizes the <img>
        // by that canvas, so untrimmed padding renders the artwork tiny.
        const trimmed = await trimImagePadding(raw);
        handleField(field, trimmed);
        toast.success(
          trimmed !== raw
            ? 'Logo loaded — blank padding trimmed. Click Save to persist.'
            : `Logo loaded (${Math.round(file.size / 1024)} KB). Click Save to persist.`,
        );
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    };
  const handleLogoUpload = uploadLogoTo('logoDataUrl');

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
          <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm font-black flex items-center gap-2" title="Switch company from the sidebar to edit its branding">
            <Building2 size={14}/> {company}
          </div>
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
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 whitespace-nowrap pb-2">
                <input type="checkbox" checked={data.showGstOnInvoice} onChange={e => handleField('showGstOnInvoice', e.target.checked)}/>
                Show tax on prints
              </label>
              <div className="flex-1">
                <Field label="GST % (Sales Tax)" value={data.gstPercent ? String(data.gstPercent) : ''} onChange={v => handleField('gstPercent', Math.max(0, Math.min(100, Number(v) || 0)))} mono placeholder="e.g. 18"/>
              </div>
            </div>
            <Field label="Address Line 1" value={data.addressLine1} onChange={v => handleField('addressLine1', v)}/>
            <Field label="Address Line 2" value={data.addressLine2} onChange={v => handleField('addressLine2', v)} optional/>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={data.city} onChange={v => handleField('city', v)}/>
              <Field label="Country" value={data.country} onChange={v => handleField('country', v)}/>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Phone"   value={data.phone}   onChange={v => handleField('phone', v)}/>
              <Field label="Email (sales / general)"   value={data.email}   onChange={v => handleField('email', v)}/>
              <Field label="Website" value={data.website} onChange={v => handleField('website', v)}/>
              <Field label="Accounts Email (invoices / receipts)" value={data.accountsEmail} onChange={v => handleField('accountsEmail', v)}/>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Quotations &amp; sales orders show the sales email; invoices &amp; receipts show the accounts email (falls back to the sales email if left blank).</p>
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
                <p className="text-[10px] font-black text-slate-600">
                  Required size: {LOGO_CANVAS_HINT}
                </p>
                <p className="text-[10px] text-slate-400 font-bold">
                  Every letterhead logo — ours and each partner&apos;s — uses this one canvas, so
                  they always print the same size. Centre the artwork on it with a little breathing
                  room. A flat off-white backdrop is punched out automatically on upload.
                </p>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mt-2">
                  <input type="checkbox" checked={data.showLogo} onChange={e => handleField('showLogo', e.target.checked)}/>
                  Show logo on prints
                </label>
              </div>
            </div>
          </Section>

          {/* Catalogue QR — printed in the document footer when switched on */}
          <Section title="Catalogue QR Code" icon={<ImageIcon size={14}/>}>
            <p className="text-[11px] text-slate-500 font-bold mb-3">
              Prints a QR in the quotation / sales-order footer. Upload the code you actually want
              scanned — a catalogue link, a WhatsApp catalogue, a tracked short link. Leave the
              image empty and one is generated from the Website field above instead.
            </p>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center bg-slate-50 shrink-0">
                {data.catalogueQrDataUrl
                  ? <img src={data.catalogueQrDataUrl} alt="Catalogue QR preview" className="w-full h-full object-contain p-1"/>
                  : <ImageIcon size={28} className="text-slate-300"/>}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black uppercase hover:bg-slate-800 cursor-pointer">
                  <Upload size={12}/> Upload QR
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={uploadLogoTo('catalogueQrDataUrl')} className="hidden"/>
                </label>
                {data.catalogueQrDataUrl && (
                  <button
                    onClick={() => handleField('catalogueQrDataUrl', '')}
                    className="ml-2 bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg text-xs font-black uppercase hover:bg-rose-100 inline-flex items-center gap-2"
                  >
                    <X size={12}/> Clear
                  </button>
                )}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mt-2">
                  <input type="checkbox" checked={data.showQrOnInvoice} onChange={e => handleField('showQrOnInvoice', e.target.checked)}/>
                  Show QR on prints
                </label>
              </div>
            </div>
          </Section>

          {/* Dual header logos — Nippon prints under two brand headers */}
          {data.company === 'Nippon' && (
            <Section title="Header Logos — KinLong / GlassTech" icon={<ImageIcon size={14}/>}>
              <p className="text-[11px] text-slate-500 font-bold mb-1">
                Nippon prints under two brand headers. Upload each brand&apos;s logo — the quotation / sales-order / receipt
                letterhead shows the matching one for the chosen print type (KinLong or GlassTech). The &quot;General&quot;
                variant uses the main Logo above.
              </p>
              <p className="text-[10px] font-black text-slate-600 mb-1">Required size: {LOGO_CANVAS_HINT}</p>
              <p className="text-[10px] text-slate-400 font-bold mb-3">
                Same canvas as the main Logo — that is what keeps a partner mark from out-sizing our own.
                Place the brand&apos;s real logo file on the canvas and rescale it; never redraw or re-generate
                it. A partner&apos;s mark only carries weight while it is pixel-faithful.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { field: 'logoKinlongDataUrl',   label: 'KinLong header logo' },
                  { field: 'logoGlasstechDataUrl', label: 'GlassTech header logo' },
                ] as const).map(({ field, label }) => (
                  <div key={field} className="border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{label}</div>
                    <div className="flex items-start gap-3">
                      <div className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 shrink-0">
                        {data[field]
                          ? <img src={data[field]} alt={`${label} preview`} className="w-full h-full object-contain p-1"/>
                          : <ImageIcon size={22} className="text-slate-300"/>}
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="inline-flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-lg text-[11px] font-black uppercase hover:bg-slate-800 cursor-pointer">
                          <Upload size={12}/> Upload
                          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={uploadLogoTo(field)} className="hidden"/>
                        </label>
                        {data[field] && (
                          <button onClick={() => handleField(field, '')}
                            className="block bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase hover:bg-rose-100">
                            <X size={12} className="inline -mt-0.5 mr-1"/> Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

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
