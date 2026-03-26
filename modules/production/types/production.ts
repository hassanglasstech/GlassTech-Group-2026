import { Company } from '../../shared/types/core';
import { PieceStatus, QuotationStatus, ProjectStatus, TemperingDispatchStatus } from '../../shared/constants';

export type { PieceStatus, QuotationStatus, ProjectStatus, TemperingDispatchStatus };

export interface HoleLocation {
  id: string;
  x: number;
  y: number;
  diameter: string;
  width?: string;
  height?: string;
  type: 'Hole' | 'Notch' | 'Cutout';
}

export interface QuotationItem {
  id: string;
  description: string;
  locationCode: string;
  glazingSpecs: string;
  qty: number;
  width: number;
  height: number;
  inchW?: number;
  sootW?: number;
  inchH?: number;
  sootH?: number;
  mmW?: number; 
  mmH?: number; 
  glassSize?: string;
  glassType?: string;
  subCategory?: string;
  selectedServices?: string[];
  notchCount?: number;
  holes?: HoleLocation[]; 
  attachedImage?: string; 
  attachmentName?: string; 
  isSection?: boolean; 
  totalSqFt: number;
  pricePerUnit: number;
  amount: number;
  subItems?: { description: string; price: number }[];
  isRevised?: boolean; 
  revisionNote?: string; 
  revisedFields?: string[];
  inputUnit?: 'MM' | 'Inch'; 
  sheetSize?: string; 
  isManualSqFt?: boolean; 
  glassColor?: string;
  aptCharges?: number;
}

export interface GlassServiceCharge {
  description: string;
  amount: number;
}

export interface Quotation {
  id: string;
  orderNo?: string; 
  invoiceNo?: string;
  company: Company;
  date: string;
  clientId: string;
  projectName?: string; 
  dueDate?: string;
  reqDate?: string;
  architect: string;
  site: string;
  subject: string;
  items: QuotationItem[];
  serviceCharges: GlassServiceCharge[];
  discountPercent: number;
  discountAmount?: number;
  glassDiscountPercent: number;
  status: QuotationStatus;
  attachments?: string[]; 
  revisedFields?: string[];
  manualSerial?: string; 
  isAlreadyDispatched?: boolean; 
  receivedAmount?: number; 
  actualDeliveryDate?: string; 
}

export type JobOrder = Quotation;

export interface PieceFault {
  id: string;
  description: string;
  reportedAt: string;
  disposal: 'None' | 'Recut' | 'Accepted';
  costImpact?: number;
}

export interface ProductionPiece {
  id: string; 
  orderId: string;
  itemIndex: number;
  specs: string;
  status: PieceStatus;
  spotId?: string; 
  receivedAtGateId?: string; 
  dispatchId?: string; 
  lastUpdated: string;
  fault?: PieceFault;
  pendingServices?: string[]; 
  isRevised?: boolean; 
  revisionNote?: string; 
}

export interface Project { 
  id: string; 
  quotationId: string; 
  company: Company; 
  clientId: string; 
  title: string; 
  status: ProjectStatus; 
  startDate: string; 
  value: number; 
  finalSettlementValue?: number; 
  manualRef?: string; 
  quotationDate?: string; 
  deliveryDate?: string; 
  glassValue?: number; 
  aluminiumValue?: number; 
  hardwareValue?: number; 
  installationValue?: number; 
  consumablesValue?: number; 
  glassConsumed?: number; 
  aluminiumConsumed?: number; 
  hardwareConsumed?: number; 
  otherConsumed?: number; 
  consumablesConsumed?: number; 
  timeline: { 
    date: string; 
    event: string; 
    type: 'info' | 'alert' | 'success'; 
  }[]; 
}

export interface TemperingDispatch { 
  id: string; 
  tripId?: string; 
  company: Company; 
  date: string; 
  dispatchTime?: string; 
  originLocation?: string; 
  plantName: string; 
  pickLocation?: string; 
  vehicleNo: string; 
  driverName: string; 
  serviceType: 'Tempering' | 'Lamination' | 'Site Delivery' | 'Supply' | 'Double Glazing' | 'Tempering Return'; 
  pieceIds: string[]; 
  totalSqFt: number; 
  status: TemperingDispatchStatus; 
  chargesPerSqFt: number; 
  totalCharges: number; 
  expectedReturnDate?: string; 
  receivedPieceIds?: string[]; 
}

export interface ProductionMetric {
  date: string;
  sqFtProcessed: number;
  totalTempered: number;
  totalHours: number;
  actualHours: number; // Includes overtime
  overtimeCost: number;
  normalCost: number;
  overtimeSqFt: number;
  normalSqFt: number;
}

export interface DailyTarget {
  targetSqFt: number;
  actualSqFt: number;
  remainingDays: number;
  pendingSqFt: number;
}
