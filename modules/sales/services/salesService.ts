import { Client, Vendor } from '../types/crm';
import { Product, Quotation, Project } from '../../shared/types';
import { supabase } from '../../../src/services/supabaseClient';

const KEYS = {
  CLIENTS:    'gtk_erp_clients',
  PRODUCTS:   'gtk_erp_products',
  QUOTATIONS: 'gtk_erp_quotations',
  PROJECTS:   'gtk_erp_projects',
  VENDORS:    'gtk_erp_vendors',
};

import { safeParse } from '../../shared/services/utils';

const dateOrNull = (v: any) => (v && String(v).trim() ? v : null);

const upClient = (c: Client) => ({
  id: c.id, company: c.company, name: c.name,
  contact_person: c.contactPerson, email: c.email, phone: c.phone,
  address: c.address, ntn: c.ntn, credit_limit: c.creditLimit ?? 0,
  status: c.status ?? 'Active',
});

const upQuotation = (q: Quotation) => ({
  id: q.id, company: q.company, date: dateOrNull(q.date), due_date: dateOrNull(q.dueDate),
  client_id: q.clientId, project_name: q.projectName, items: q.items ?? [],
  status: q.status ?? 'Draft', is_already_dispatched: q.isAlreadyDispatched ?? false,
  discount_percent: q.discountPercent ?? 0, manual_serial: q.manualSerial ?? '',
  order_no: q.orderNo ?? '', revised_fields: q.revisedFields ?? [],
  received_amount: q.receivedAmount ?? 0, actual_delivery_date: dateOrNull(q.actualDeliveryDate),
});

export const SalesService = {
  getClients: (): Client[] => safeParse(KEYS.CLIENTS),
  saveClients: (data: Client[]) => {
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(data));
    supabase.from('clients').upsert(data.map(upClient)).then(({ error }) => {
      if (error) console.error('[SalesService] clients sync error:', error.message);
    });
  },

  getProducts: (): Product[] => safeParse(KEYS.PRODUCTS),
  saveProducts: (data: Product[]) => localStorage.setItem(KEYS.PRODUCTS, JSON.stringify(data)),

  getQuotations: (): Quotation[] => safeParse(KEYS.QUOTATIONS),
  saveQuotations: (data: Quotation[]) => {
    localStorage.setItem(KEYS.QUOTATIONS, JSON.stringify(data));
    supabase.from('quotations').upsert(data.map(upQuotation)).then(({ error }) => {
      if (error) console.error('[SalesService] quotations sync error:', error.message);
    });
  },

  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]) => {
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(data));
    supabase.from('projects').upsert(data).then(({ error }) => {
      if (error) console.error('[SalesService] projects sync error:', error.message);
    });
  },

  getVendors: (): Vendor[] => safeParse(KEYS.VENDORS),
  saveVendors: (data: Vendor[]) => {
    localStorage.setItem(KEYS.VENDORS, JSON.stringify(data));
    supabase.from('vendors').upsert(data).then(({ error }) => {
      if (error) console.error('[SalesService] vendors sync error:', error.message);
    });
  },
};
