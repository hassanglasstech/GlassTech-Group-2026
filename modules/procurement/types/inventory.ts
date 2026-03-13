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
  requiresCashPayment?: boolean;     // Does this REQ need a cash payment?
  estimatedAmount?: number;          // Expected payment amount
  paymentStatus?: 'Pending' | 'Paid' | 'Partial' | 'Not Required';
  paidAmount?: number;               // Amount actually paid
  paymentRef?: string;               // Cash journal / GL doc reference
  paymentDate?: string;              // Date payment was made
  glAccountHint?: string;            // Suggested GL account code
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
