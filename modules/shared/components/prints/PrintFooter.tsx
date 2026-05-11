/**
 * PrintFooter.tsx — Sprint 33
 *
 * Reusable footer block for every customer-facing print:
 *   • Bank details (when invoice + show_bank_on_invoice = true)
 *   • Per-document Terms & Conditions (Markdown-flavoured plaintext;
 *     callers pick which T&C field to render via `termsKey` prop)
 *   • Signature lines — caller can override via `signatureLines`,
 *     defaults to a single "Authorised Signatory" from branding
 *   • Document footer text + page hint
 *
 * All values pulled SYNCHRONOUSLY from BrandingService cache.
 *
 * Usage:
 *   <PrintFooter
 *     company="Glassco"
 *     termsKey="termsInvoice"
 *     showBank
 *     signatureLines={['Prepared By', 'Approved By', 'Customer Signature']}
 *   />
 */

import React from 'react';
import { BrandingService, CompanyBranding } from '@/modules/shared/services/brandingService';

interface Props {
  company:       string;
  /** Which T&C block to render. Default = none. */
  termsKey?:     'termsQuotation' | 'termsInvoice' | 'termsDeliveryChallan'
              | 'termsServiceOrder' | 'termsCreditNote' | 'termsGrn';
  /** Force-show bank details (invoice + receipt). Default reads
   *  branding.showBankOnInvoice. */
  showBank?:     boolean;
  /** Custom signature labels. Default = single "Authorised Signatory". */
  signatureLines?: string[];
  /** Tighter spacing for thermal/receipt prints. */
  compact?:      boolean;
  /** Custom footer note (e.g. "This is a system-generated invoice…"). */
  footerNote?:   string;
}

const PrintFooter: React.FC<Props> = ({
  company, termsKey, showBank, signatureLines, compact = false, footerNote,
}) => {
  const b: CompanyBranding = BrandingService.getCachedBranding(company);
  const terms = termsKey ? (b[termsKey] as string) : '';
  const wantsBank = showBank ?? b.showBankOnInvoice;
  const hasBank = wantsBank && (b.bankName || b.bankIban || b.bankAccountNo);

  const sigLines = signatureLines && signatureLines.length > 0
    ? signatureLines
    : [b.signatureBlock || 'Authorised Signatory'];

  return (
    <div
      style={{
        marginTop:  compact ? '12px' : '24px',
        fontFamily: 'Arial, sans-serif',
        color:      '#1e293b',
      }}
    >
      {/* Bank details block */}
      {hasBank && (
        <div
          style={{
            border:       '1px solid #cbd5e1',
            borderRadius: '4px',
            padding:      compact ? '6px 8px' : '8px 12px',
            background:   '#f8fafc',
            fontSize:     compact ? '9px' : '10px',
            marginBottom: compact ? '8px' : '14px',
          }}
        >
          <div style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a', marginBottom: '4px' }}>
            Bank Details — {b.bankName || '—'}{b.bankBranch ? `, ${b.bankBranch}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '4px 16px' }}>
            {b.bankAccountTitle && <div><span style={{ color: '#64748b' }}>Title: </span><span style={{ fontWeight: 700 }}>{b.bankAccountTitle}</span></div>}
            {b.bankAccountNo    && <div><span style={{ color: '#64748b' }}>A/C #: </span><span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{b.bankAccountNo}</span></div>}
            {b.bankIban         && <div><span style={{ color: '#64748b' }}>IBAN: </span><span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{b.bankIban}</span></div>}
            {b.bankSwift        && <div><span style={{ color: '#64748b' }}>SWIFT: </span><span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{b.bankSwift}</span></div>}
          </div>
        </div>
      )}

      {/* Terms & conditions */}
      {terms && (
        <div
          style={{
            border:       '1px solid #e2e8f0',
            borderRadius: '4px',
            padding:      compact ? '6px 8px' : '8px 12px',
            fontSize:     compact ? '9px' : '10px',
            color:        '#475569',
            marginBottom: compact ? '10px' : '18px',
            whiteSpace:   'pre-wrap',
            lineHeight:   1.5,
          }}
        >
          <div style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a', marginBottom: '4px' }}>
            Terms &amp; Conditions
          </div>
          {terms}
        </div>
      )}

      {/* Signature lines */}
      {sigLines.length > 0 && (
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: `repeat(${Math.min(sigLines.length, 4)}, 1fr)`,
            gap:                 compact ? '20px' : '40px',
            marginTop:           compact ? '24px' : '40px',
            pageBreakInside:     'avoid',
            breakInside:         'avoid',
          }}
        >
          {sigLines.map((label, i) => (
            <div
              key={i}
              style={{
                borderTop:     '1px solid #0f172a',
                paddingTop:    '6px',
                textAlign:     'center',
                fontSize:      compact ? '8px' : '9px',
                fontWeight:    900,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color:         '#1e293b',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Footer note */}
      {footerNote && (
        <div
          style={{
            marginTop:  compact ? '10px' : '18px',
            fontSize:   compact ? '8px' : '9px',
            color:      '#94a3b8',
            textAlign:  'center',
            fontStyle:  'italic',
          }}
        >
          {footerNote}
        </div>
      )}
    </div>
  );
};

export default PrintFooter;
