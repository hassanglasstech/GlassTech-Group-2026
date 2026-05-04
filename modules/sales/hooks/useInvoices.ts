/**
 * useInvoices + usePaymentReceipts — Sprint 3 / Day 12-13
 *
 * Postgres-primary reads via TanStack Query. Replaces synchronous
 * SalesService.getInvoices() in components.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/modules/shared/store/appStore';
import { AsyncSalesService } from '../services/asyncSalesService';
import { qk } from '@/src/services/queryClient';
import type { Invoice, PaymentReceipt } from '@/modules/shared/types';

/** Read invoices for active company. */
export function useInvoices() {
  const company = useAppStore(s => s.selectedCompany);
  return useQuery({
    queryKey: qk.invoices(company),
    queryFn:  async () => {
      const all = await AsyncSalesService.getInvoices();
      return all.filter((i: Invoice) => i.company === company);
    },
    staleTime: 30_000,
  });
}

/** Outstanding (unpaid) invoices only — convenience derivative. */
export function useOutstandingInvoices() {
  const q = useInvoices();
  return {
    ...q,
    data: q.data?.filter((i: Invoice) =>
      i.status !== 'Paid' && i.status !== 'Voided'
    ) ?? [],
  };
}

/** Bulk save invoices. */
export function useSaveInvoices() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (data: Invoice[]) => {
      await AsyncSalesService.saveInvoices(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.invoices(company) });
    },
  });
}

/** Read payment receipts for active company. */
export function usePaymentReceipts() {
  const company = useAppStore(s => s.selectedCompany);
  return useQuery({
    queryKey: qk.paymentReceipts(company),
    queryFn: async () => {
      const all = await AsyncSalesService.getPaymentReceipts();
      // PaymentReceipt rows don't always carry company directly — filter
      // by linked invoice's company when we have the invoice cache loaded.
      const invoices = await AsyncSalesService.getInvoices();
      const companyInvoiceIds = new Set(
        invoices.filter((i: Invoice) => i.company === company).map((i: Invoice) => i.id)
      );
      return all.filter((p: PaymentReceipt) =>
        companyInvoiceIds.has(p.invoiceId)
      );
    },
    staleTime: 30_000,
  });
}

/** Save payment receipts (bulk). */
export function useSavePaymentReceipts() {
  const qc = useQueryClient();
  const company = useAppStore(s => s.selectedCompany);
  return useMutation({
    mutationFn: async (data: PaymentReceipt[]) => {
      await AsyncSalesService.savePaymentReceipts(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.paymentReceipts(company) });
      // Receipts change invoice balance — invalidate invoices too
      qc.invalidateQueries({ queryKey: qk.invoices(company) });
    },
  });
}
