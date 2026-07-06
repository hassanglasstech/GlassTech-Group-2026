import { describe, it, expect } from 'vitest';
import { evaluateInvoiceReadiness } from './invoiceReadiness';

describe('evaluateInvoiceReadiness (POD-gate guardrail)', () => {
  it('POD complete → allowed, no override needed', () => {
    const r = evaluateInvoiceReadiness({ podCompleted: true, hasDeliveryDate: true });
    expect(r.allowed).toBe(true);
    expect(r.requiresOverride).toBe(false);
  });

  it('POD complete without a delivery date is still allowed (POD is the proof)', () => {
    const r = evaluateInvoiceReadiness({ podCompleted: true, hasDeliveryDate: false });
    expect(r.allowed).toBe(true);
  });

  it('no POD but delivery date on file, no override → blocked, override required', () => {
    const r = evaluateInvoiceReadiness({ podCompleted: false, hasDeliveryDate: true });
    expect(r.allowed).toBe(false);
    expect(r.requiresOverride).toBe(true);
  });

  it('no POD but delivery date on file, with override reason → allowed', () => {
    const r = evaluateInvoiceReadiness({
      podCompleted: false,
      hasDeliveryDate: true,
      override: { reason: 'POD lost, goods confirmed delivered by client call' },
    });
    expect(r.allowed).toBe(true);
    expect(r.requiresOverride).toBe(true);
    expect(r.reason).toMatch(/override/i);
  });

  it('no POD and no delivery date → blocked even WITH an override (in-transit goods)', () => {
    const r = evaluateInvoiceReadiness({
      podCompleted: false,
      hasDeliveryDate: false,
      override: { reason: 'customer said just bill it' },
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/in-transit|not delivered/i);
  });

  it('blank override reason does not count as an override', () => {
    const r = evaluateInvoiceReadiness({ podCompleted: false, hasDeliveryDate: true, override: { reason: '   ' } });
    expect(r.allowed).toBe(false);
  });
});
