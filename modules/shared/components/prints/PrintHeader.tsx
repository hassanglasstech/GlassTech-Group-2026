/**
 * PrintHeader.tsx — Sprint 33
 *
 * Reusable letterhead block for every customer-facing print:
 *   • Logo (left) — from company_branding.logo_data_url, only when
 *     show_logo is true and a data URL is present
 *   • Company info (centre) — legal name, address, contact, web
 *   • Document title + meta (right) — caller-supplied
 *   • NTN / STRN strip — surfaces the tax registration numbers
 *     required on every Pakistani sales-tax invoice (FBR rule).
 *
 * All values pulled SYNCHRONOUSLY from BrandingService cache so the
 * print flow doesn't paint a blank header. App boot must call
 * BrandingService.prefetchAll() before first print.
 *
 * Usage:
 *   <PrintHeader
 *     company="Glassco"
 *     docTitle="TAX INVOICE"
 *     docNumber={invoice.id}
 *     docMeta={[
 *       { label: 'Date', value: invoice.date },
 *       { label: 'Due',  value: invoice.dueDate },
 *     ]}
 *   />
 */

import React from 'react';
import { BrandingService, CompanyBranding } from '@/modules/shared/services/brandingService';

interface MetaRow { label: string; value: React.ReactNode; }

interface Props {
  company:   string;
  docTitle:  string;                       // e.g. 'TAX INVOICE', 'QUOTATION'
  docNumber?: string;
  docMeta?:   MetaRow[];                   // right-side rows
  /** Override branding (testing / preview). */
  brandingOverride?: Partial<CompanyBranding>;
  /** Tighter spacing for thermal/receipt prints. */
  compact?: boolean;
  /** Hide the NTN/STRN row (e.g. internal-only Job Card). */
  hideTaxNumbers?: boolean;
}

const PrintHeader: React.FC<Props> = ({
  company, docTitle, docNumber, docMeta = [], brandingOverride, compact = false, hideTaxNumbers = false,
}) => {
  const b: CompanyBranding = { ...BrandingService.getCachedBranding(company), ...(brandingOverride || {}) };

  const addressLines = [b.addressLine1, b.addressLine2, [b.city, b.country].filter(Boolean).join(', ')]
    .filter(Boolean);
  const contactLines = [
    b.phone   ? `Tel: ${b.phone}` : null,
    b.email   ? `Email: ${b.email}` : null,
    b.website ? `Web: ${b.website}` : null,
  ].filter(Boolean) as string[];

  const padY = compact ? '6px' : '14px';
  const titleSize = compact ? '20px' : '28px';

  return (
    <div
      style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        gap:            '16px',
        padding:        `${padY} 0 12px 0`,
        borderBottom:   '2px solid #0f172a',
        marginBottom:   '12px',
        fontFamily:     'Arial, sans-serif',
      }}
    >
      {/* LEFT — Logo + legal name + address */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minWidth: 0, flex: '1 1 0' }}>
        {b.showLogo && b.logoDataUrl && (
          <img
            src={b.logoDataUrl}
            alt={`${b.company} logo`}
            style={{ width: compact ? '48px' : '64px', height: compact ? '48px' : '64px', objectFit: 'contain', flexShrink: 0 }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: compact ? '14px' : '18px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', lineHeight: 1.1 }}>
            {b.legalName || `GlassTech Group — ${company}`}
          </div>
          {addressLines.length > 0 && (
            <div style={{ fontSize: compact ? '9px' : '10px', color: '#475569', marginTop: '3px', lineHeight: 1.4 }}>
              {addressLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          {contactLines.length > 0 && (
            <div style={{ fontSize: compact ? '9px' : '10px', color: '#475569', marginTop: '2px' }}>
              {contactLines.join(' · ')}
            </div>
          )}
          {!hideTaxNumbers && (b.ntn || b.strn) && (
            <div style={{ fontSize: compact ? '9px' : '10px', color: '#0f172a', fontWeight: 700, marginTop: '4px' }}>
              {b.ntn  && <span style={{ marginRight: '12px' }}>NTN: <span style={{ fontFamily: 'monospace' }}>{b.ntn}</span></span>}
              {b.strn && <span>STRN: <span style={{ fontFamily: 'monospace' }}>{b.strn}</span></span>}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — Document title + number + meta */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: titleSize, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {docTitle}
        </div>
        {docNumber && (
          <div style={{ fontSize: compact ? '12px' : '14px', fontWeight: 900, color: '#1d4ed8', marginTop: '4px', fontFamily: 'monospace' }}>
            {docNumber}
          </div>
        )}
        {docMeta.length > 0 && (
          <div style={{ fontSize: compact ? '9px' : '10px', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>
            {docMeta.map((r, i) => (
              <div key={i}>
                <span style={{ color: '#94a3b8', marginRight: '4px' }}>{r.label}:</span>
                <span style={{ fontWeight: 700 }}>{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintHeader;
