import { Company } from '../../shared/types/core';
import { ClientStatus, VendorType } from '../../shared/constants';

export type { ClientStatus, VendorType };

export interface Client {
  id: string;
  company: Company;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  ntn: string;
  creditLimit: number;
  status: ClientStatus;
  createdAt: string;
}

export interface VendorRate {
  id: string;
  thickness: string;
  type: string;
  rate: number;
  effectiveDate: string;
}

// ── Vendor Rate List Version — snapshot of rates at a point in time ──────
export interface VendorRateListVersion {
  id: string;
  date: string;                    // when this version was created
  createdBy: string;
  label: string;                   // e.g. "Version 3 — 28 Mar 2026"
  rates: VendorRate[];             // snapshot of all rates at that time
}

export interface Vendor {
  id: string;
  company?: Company;
  name: string;
  nickName?: string;
  address?: string;
  registrationDate?: string;
  type: VendorType;
  contactPerson?: string;
  phone?: string;
  vehicles?: string[]; 
  balance?: number;
  rates?: VendorRate[];
  rateListVersions?: VendorRateListVersion[];
}
