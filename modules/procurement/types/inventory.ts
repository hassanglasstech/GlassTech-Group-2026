import { Company } from '@/modules/shared/types/core';
import { RequisitionStatus, PurchaseOrderStatus } from '@/modules/shared/constants';

export type { RequisitionStatus, PurchaseOrderStatus };

export interface Product {
  id: string;
  company: Company;
  category: string; 
  description: string;
  basePrice: number; 
  temperingPrice?: number;
  costPrice?: number; 
  unit: 'SqFt' | 'Unit' | 'RunningFt' | 'Inch' | 'KG' | 'Mtr' | 'Sheet' | 'PCS' | 'Set' | 'Pair' | 'Roll' | 'Pkt' | 'Box' | 'Ltr' | 'Tube';
  variants: string[];
  glassType?: 'Clear' | 'Plain' | 'Color' | 'Fluted' | 'Mirror' | 'Tinted' | 'Reflective' | 'Frosted' | 'Tempered' | 'Annealed' | 'Laminated' | 'Double Glazed' | 'One Side';
  mainCategory?: string; 
  subCategory?: string; 
  thickness?: string;
  sheetSize?: string; 
  serviceNick?: string; 
  brand?: string; 
  modelNo?: string; 
  finishColor?: string; 
  material?: string; 
  imageUrl?: string; 
  direction?: string; 
  tongueLength?: string; 
  spindleLength?: string; 
  profileCode?: string; 
  systemSubClass?: 'Thermal' | 'Non-Thermal'; 
  profileRole?: 'Frame' | 'Sash' | 'Mullion' | 'Bead' | 'Interlock' | 'Screen' | 'Adaptor'; 
  technicalSpecs?: Record<string, string>;
  width?: number;
  height?: number;
  frameColor?: string;
  meshColor?: string;
  isSet?: boolean;
  setComponents?: ProductComponent[];
  hsCode?: string;
}

export interface ProductComponent {
  id: string;
  description: string;
  unit: string;
  qtyPerSet: number;
}

export interface StoreItem { 
  id: string; 
  company: Company; 
  name: string; 
  category: 'Raw' | 'Hardware' | 'Consumable' | 'Profile' | 'Service'; 
  quantity: number; 
  unrestrictedQty: number; 
  qiQty: number; 
  blockedQty: number; 
  reservedQty: number; 
  consignmentQty: number; 
  unit: string; 
  altUnit?: string; 
  conversionFactor?: number; 
  minLevel: number; 
  reorderPoint: number; 
  movingAveragePrice: number; 
  totalValue: number; 
  storageBin: string; 
  lastMovementDate: string; 
}

export type MvmntCode = '101' | '201' | '261' | '601';

export interface MaterialLedgerEntry { 
  id: string; 
  company: Company; 
  materialId: string; 
  timestamp: string; 
  mvmntCode: MvmntCode; 
  qty: number; 
  uom: string; 
  valuation: number; 
  balanceAfter: number; 
  referenceDoc: string; 
  user: string; 
  remarks: string; 
  storageBin?: string; 
  batchNo?: string; 
  huId?: string; 
  projectId?: string;
  pcPerCtn?: number;
  noOfCtn?: number;
  grossWeight?: number;
  netWeight?: number;
  cbm?: number;
  // ── Glass Sheet Tagging ─────────────────────────────────────────────
  sheetTags?: string[];          // Auto-generated per-sheet tags: GLS-{thickness}-{MMYY}-{batch}-{serial}
  sheetTagMeta?: {               // Tag metadata for print
    thickness: string;
    sheetSize: string;
    vendorName?: string;
    grnRef: string;
    grnDate: string;
    batchSeq: string;            // e.g. "001"
  };
}

export interface RequisitionItem { 
  id: string; 
  itemCategory: string; 
  materialDesc: string; 
  qty: number; 
  unit: string; 
  estimatedRate: number; 
  deliveryDate: string; 
  costCenter: string; 
}

export interface Requisition { 
  id: string; 
  company: Company; 
  targetCompany?: Company; 
  date: string; 
  headerText: string; 
  requisitioner: string; 
  priority: 'Normal' | 'Urgent' | 'Low'; 
  items: RequisitionItem[]; 
  totalValue: number; 
  status: RequisitionStatus; 
  category?: string;
  subCategory?: string;
  reqType?: string; 
  approvedBy?: string; 
  
  // HR Requisition Fields
  employeeId?: string;
  employeeName?: string;
  loanAmount?: number;
  loanPurpose?: string;
  installments?: number;
  skipMonth?: string;
  absentDate?: string;
  absentReason?: string;
  overtimeHours?: number;
  overtimeProject?: string;
  overtimeEmployees?: string[];

  // New Requisition Fields
  siteName?: string;
  from?: string;
  to?: string;
  amount?: number;
  vehicleType?: string;
  vehicleNo?: string;
  driver?: string;
  purpose?: string;
  projectOrSiteName?: string;
  qty?: number;
  description?: string;
  type?: string;

  // Financial Impact Fields (Phase 3)
  requiresCashPayment?: boolean;
  estimatedAmount?: number;
  paymentStatus?: 'Pending' | 'Paid' | 'Partial' | 'Not Required';
  paidAmount?: number;
  paymentRef?: string;
  paymentDate?: string;
  glAccountHint?: string;
}

export interface PurchaseOrder { 
  id: string; 
  fromCompany: Company; 
  toVendor: string; 
  date: string; 
  status: PurchaseOrderStatus; 
  totalAmount: number; 
  category?: 'Glass' | 'Aluminium' | 'Hardware' | 'Installation' | 'Tempering'; 
  projectId?: string; 
  items: { 
    description?: string; 
    qty?: number; 
    rate?: number; 
    costCenter?: string; 
    pieceId?: string; 
    specs?: string; 
  }[];
  // Three-Way Matching Fields
  reqId?: string;
  grnRef?: string;
  grnDate?: string;
  grnQty?: number;
  vendorInvoiceNo?: string;
  vendorInvoiceDate?: string;
  vendorInvoiceAmount?: number;
  matchStatus?: 'Pending' | '2-Way' | '3-Way' | 'Mismatch' | 'On-Hold';
  matchNotes?: string;
  apInvoiceId?: string;
  approvalLevel?: 'L1' | 'L2' | 'L3';
  approvalHistory?: { level: string; by: string; date: string; action: string; note?: string }[];
}

export interface WarehouseSpot { 
  id: string; 
  company: Company; 
  code: string; 
  zone: 'Servicing' | 'Tempering' | 'Delivery'; 
}

export interface GatePass { 
  id: string; 
  company: Company; 
  type: 'Inward' | 'Outward'; 
  mvmntCode: string; 
  vehicleNo: string; 
  vehicleType?: string; 
  driverName: string; 
  materialDetails: string; 
  qty: number; 
  unit: string; 
  tareWeight?: number; 
  grossWeight?: number; 
  isReturnable: boolean; 
  timestamp: string; 
  status: 'Pending' | 'Allowed' | 'Posted'; 
  linkedDispatchId?: string; 
  fromVendor?: string; 
}

export interface InspectionLot { id: string; }
export interface Remnant { id: string; }
export interface HandlingUnit { id: string; }

// ── Vehicle Fleet Management ─────────────────────────────────────────
export interface Vehicle {
  id: string;
  plateNo: string;
  type: 'Pickup' | 'Truck' | 'Loader' | 'Shehzore' | 'Container' | 'Other';
  owner: 'Factory' | 'Hired';
  driverName: string;
  driverPhone?: string;
  monthlyInstallment: number;
  hireRate: number;
  status: 'Active' | 'Maintenance' | 'Inactive';
  notes?: string;
}

export interface VehicleTrip {
  id: string;
  vehicleId: string;
  dispatchId?: string;
  company: Company;
  date: string;
  destination: string;
  serviceType: string;
  fare: number;
  fuelCost?: number;
  tollCharges?: number;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  paidStatus: 'Unpaid' | 'Paid';
  glTxId?: string;
}

// Vehicle running expenses (fuel, maintenance, challan, installment, etc.)
export interface VehicleExpense {
  id: string;
  vehicleId: string;
  date: string;
  type: 'Fuel' | 'Maintenance' | 'Challan' | 'Toll' | 'Insurance' | 'Installment' | 'Other';
  amount: number;
  description: string;
  paidBy?: 'Cash' | 'Bank' | 'Petty Cash';
  paidStatus: 'Unpaid' | 'Paid';
  glTxId?: string;
  month?: string;
}
