import { ProfileType, NettingType, WindowTypeId } from './gtkQuotationConstants';

export interface GTKQuoteHeader {
  refNo: string;
  date: string;
  validTill: string;
  clientId: string;
  clientName: string;
  site: string;
  architect: string;
  color: string;
  profileType: ProfileType;
  sectionSize: string;
  sectionBrand: string;   // e.g. "GT Gulf Series", "P Series", "KINBON"
  hardware: string;       // e.g. "KINLONG", "KHASS"
  subject: string;        // auto-generated, overridable
  mode: 'aluminum' | 'inclusive'; // aluminum only OR glass included
  installationIncluded: boolean;
  discount: number;       // percentage
  cartage: number;        // fixed Rs amount
  terms: string;
}

export interface GTKQuoteItem {
  id: string;
  serialNo: string;
  windowTypeId: WindowTypeId;
  profile: string;           // section size for this item (may differ from header)
  glassSpecId: string;
  customGlassLabel: string;
  floor: string;
  location: string;
  locationCode: string;      // e.g. W1, DW-3
  qty: number;
  widthFt: number;
  heightFt: number;
  netting: NettingType;
  dividerNote: string;       // e.g. "Bottom & Center Fixed With Dividers"
  rateOverride: string;      // if blank, uses rate card
  glassRateOverride: string;
  notes: string;
  coupled: boolean;
  coupledWith: string;       // e.g. "Item 10-A & 10-C joined with Coupling Profile"
  // computed
  sqftPerPiece: number;
  totalSqft: number;
  effectiveRate: number;
  aluminumAmt: number;
  glassAmt: number;
  nettingAmt: number;
  total: number;
}

export interface GTKQuotation {
  id: string;
  company: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected';
  header: GTKQuoteHeader;
  options: GTKQuoteOption[];
  activeOptionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GTKQuoteOption {
  id: string;
  label: string;       // 'Option A', 'Option B (Final)', 'Revised-2'
  profileType: string;
  sectionSize: string;
  items: GTKQuoteItem[];
  totalSqft: number;
  totalAmount: number;
  isActive: boolean;
}
