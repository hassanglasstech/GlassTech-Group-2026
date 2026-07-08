import { Company } from '@/modules/shared/types/core';
import { RequisitionStatus, PurchaseOrderStatus } from '@/modules/shared/constants';

export type { RequisitionStatus, PurchaseOrderStatus };

export interface Product {
  id: string;
  company: Company;
  // Sprint 2 — optimistic concurrency
  version?: number;
  category: string;
  description: string;
  basePrice: number;
  temperingPrice?: number;
  costPrice?: number; 
  unit: 'SqFt' | 'Unit' | 'RunningFt' | 'Inch' | 'KG' | 'Mtr' | 'Sheet' | 'PCS' | 'Set' | 'Pair' | 'Roll' | 'Pkt' | 'Box' | 'Ltr' | 'Tube';
  variants: string[];
  /** When this product is a colour/direction/size variant of another, the parent
   *  product id. Variants are their own stockable rows (own qty/price/image) but
   *  link back here for grouping/traceability. */
  variantOf?: string;
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
  /** Legacy aliases for runtime fields used by Nippon UI code.
   *  `name` ≈ description, `itemCode` ≈ modelNo, `price` ≈ basePrice. */
  name?: string;
  itemCode?: string;
  price?: number;
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
  /** When a product is a member of a set, points to the parent set product's id. */
  setId?: string;
  /** Legacy alias used by some Nippon UI/import paths; mirrors imageUrl. */
  image?: string;
  hsCode?: string;
  /** Optional second detail line shown under the description (Nippon: KinLong Notes / supplier notes). */
  subDescription?: string;
  /** Internal local-market nick name (Nippon). Searchable, but never printed
   *  on quotations/invoices — staff-facing alias only. */
  nickName?: string;
  // ── Price History (version tracking) ────────────────────────────
  priceHistory?: PriceHistoryEntry[];
}

// ── Price History Entry — tracks rate changes over time ───────────────
export interface PriceHistoryEntry {
  id: string;
  date: string;                    // when the change was made
  changedBy: string;               // who changed it
  oldBasePrice: number;
  newBasePrice: number;
  oldCostPrice: number;
  newCostPrice: number;
  oldTemperingPrice?: number;
  newTemperingPrice?: number;
  reason?: string;                 // optional: why rate changed
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
  // Sprint 2 — optimistic concurrency
  version?: number;
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

  // ── Glass Defect Tracking ─────────────────────────────────────────
  defectiveSheets?: number;       // count of defective/broken sheets in stock
  defectiveQty?: number;          // usable sqft in defective pool
  defectiveSqft?: number;         // alias for defectiveQty (sqft basis)
  defectiveValue?: number;        // value at MAP of defective usable area

  // ── Scrap Tracking (per thickness, accumulated) ───────────────────
  scrapSqft?: number;             // total scrap sqft accumulated since last disposal
  scrapWeightKG?: number;         // estimated weight (scrapSqft × perSqftWeightKg)
  lastScrapDisposalDate?: string;

  // ── Weight Reference (set from GRN, used for scrap/dispatch) ─────
  perSheetWeightKg?: number;      // avg weight per sheet for this material
  perSqftWeightKg?: number;       // weight per sqft (used in freight allocation)

  // ── Remnant Tracking ──────────────────────────────────────────────
  remnantCount?: number;          // number of remnant pieces in stock
  remnantSqft?: number;           // total usable sqft across all remnants
  // ── Barcode / QR (Task 4 — Phase 9) ──────────────────────────────
  /**
   * Barcode or QR string for mobile scanner integration.
   * Unique within company. Printed on shelf bin label; scanned at GRN and goods issue.
   * Format convention: <COMPANY>-<CATEGORY>-<SEQUENCE> (e.g. "GTK-RAW-00142")
   */
  barcode?: string;
}

export type MvmntCode = '101' | '102' | '201' | '261' | '551' | '561' | '601';
// 101 = GRN, 102 = GRN Reversal, 201 = Consumption/Issue,
// 261 = Issue to Production, 551 = Remnant Created, 561 = Opening Balance, 601 = Other

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

  // ── GRN Extended Fields ───────────────────────────────────────────
  dcNo?: string;                  // Vendor Delivery Challan number
  biltyNo?: string;               // Transporter Bilty number
  biltyFreightPKR?: number;       // Freight amount as per bilty
  vendorSoNo?: string;            // Vendor Sales Order number
  vehicleNo?: string;             // Truck registration
  driverName?: string;            // Driver name (for PV auto-fill)
  driverPhone?: string;           // Driver contact (for PV auto-fill)
  freightType?: 'Vendor Included' | 'Own Expense';
  freightPKR?: number;            // Total freight for this GRN
  otherChargesPKR?: number;       // Other charges
  otherChargesDesc?: string;      // Description of other charges
  lineWeightKg?: number;          // Total weight for this line item (our measurement)
  biltyWeightKg?: number;         // Transporter bilty weight (includes packaging)
  perSheetWeightKg?: number;      // Calculated: lineWeightKg / sheetCount
  perSqftWeightKg?: number;       // Calculated: lineWeightKg / totalSqft
  vendorId?: string;
  vendorName?: string;
  poId?: string;                  // Linked PO ID
  sheetCount?: number;            // Number of sheets in this GRN line
  glassCategory?: string;

  // ── Sheet Tags ────────────────────────────────────────────────────
  sheetTags?: string[];
  sheetTagMeta?: {
    thickness: string;
    sheetSize: string;
    vendorName?: string;
    grnRef: string;
    grnDate: string;
    batchSeq: string;
  };

  // ── Reversal Tracking ─────────────────────────────────────────────
  reversalOf?: string;
  isReversal?: boolean;
  reversalReason?: string;
}

// ── GRN Sheet Entry — per-sheet inspection record ─────────────────────────
export interface GRNSheetEntry {
  id: string;                     // matches tag ID e.g. GLS-5MM-0326-001-01
  grnId: string;                  // parent GRN reference
  company: Company;
  tagId: string;
  lineIndex: number;              // which GRN line this sheet belongs to
  materialId: string;
  thickness: string;
  sheetSize: string;
  sqftPerSheet: number;

  // ── Inspection Result ─────────────────────────────────────────────
  status: 'OK' | 'Defective' | 'Broken';
  defectCode?: 'BR-01' | 'BR-02' | 'BR-03' | 'BR-04' | 'BR-05' | 'BR-06';
  defectDescription?: string;
  usableSqft?: number;            // for Defective/Broken — usable area
  cutterNote?: string;            // instruction for cutter

  // ── Photos ────────────────────────────────────────────────────────
  photos?: string[];              // base64 images

  // ── Audit ─────────────────────────────────────────────────────────
  inspectedBy: string;
  inspectedAt: string;
  defectConfirmedBy?: string;     // second person confirmation
  defectConfirmedAt?: string;

  // ── Vendor Claim ──────────────────────────────────────────────────
  claimAmount?: number;           // original value - usable value
  claimStatus?: 'Pending' | 'Sent' | 'Confirmed' | 'Disputed';

  // ── Undergauge / Custom Size ───────────────────────────────────
  isUndergauge?: boolean;         // sheet received smaller than standard
  actualSize?: string;            // actual WxH if different from standard e.g. "80x140"

  // ── Storage Location ──────────────────────────────────────────
  locationCode?: string;          // warehouse position code e.g. "A-01"

  // ── Consumption Lock (Sprint 0) ───────────────────────────────
  consumedInSessionId?: string;   // cutting session that claimed this sheet
  consumedAt?: string;            // ISO timestamp when consumed
  consumedBy?: string;            // cutter name who consumed
}

// ── Vendor Defect Report — formal report sent to vendor ───────────────────
export interface VendorDefectReport {
  id: string;                     // e.g. VDR-GLASSCO-0326-001
  company: Company;
  grnId: string;
  vendorId: string;
  vendorName: string;
  reportDate: string;
  defectEntries: {
    tagId: string;
    defectCode: string;
    defectDescription: string;
    originalSqft: number;
    usableSqft: number;
    originalValue: number;
    usableValue: number;
    adjustmentAmount: number;
    photos: string[];
  }[];
  totalAdjustment: number;
  preparedBy: string;
  // ── Dispatch tracking ─────────────────────────────────────────────
  sentAt?: string;
  sentBy?: string;
  sentVia?: 'WhatsApp' | 'Email' | 'Print' | 'Other';
  verballyConfirmedBy?: string;   // who gave verbal OK
  verballyConfirmedAt?: string;
  // ── Resolution ───────────────────────────────────────────────────
  status: 'Draft' | 'Sent' | 'Verbally Confirmed' | 'Disputed' | 'Settled';
  settlementRef?: string;         // GL journal ID when settled
}

// ── Remnant — post-cut usable offcut ─────────────────────────────────────
export type RemnantShape = 'Rectangle' | 'L-Shape';
export type RemnantStatus = 'Available' | 'Reserved' | 'Used' | 'Scrapped';

export interface RemnantDimensions {
  // Rectangle
  widthInch?: number;
  heightInch?: number;
  // L-Shape: two rectangles
  rect1Width?: number;
  rect1Height?: number;
  rect2Width?: number;
  rect2Height?: number;
}

export interface Remnant {
  id: string;                     // e.g. REM-5MM-0326-001
  company: Company;
  parentTagId: string;            // original sheet tag this came from
  parentGrnId: string;
  jobOrderId?: string;            // job that produced this remnant
  cuttingSessionId?: string;

  // ── Material Info ─────────────────────────────────────────────────
  materialId: string;
  thickness: string;
  glassCategory: string;
  subCategory?: string;

  // ── Dimensions & Area ─────────────────────────────────────────────
  shape: RemnantShape;
  dimensions: RemnantDimensions;
  sqft: number;                   // calculated from dimensions
  estimatedWeightKg?: number;     // sqft × perSqftWeightKg from GRN

  // ── Storage ───────────────────────────────────────────────────────
  binLocation: string;            // e.g. "Bay-A Rack-3 Left"

  // ── Status ────────────────────────────────────────────────────────
  status: RemnantStatus;
  createdAt: string;
  createdBy: string;
  usedAt?: string;
  usedInJobId?: string;
  scrapReason?: string;           // mandatory when status = Scrapped
  scrapDate?: string;
  scrapSqft?: number;             // actual sqft when scrapped

  // ── History (for threshold suggestion) ────────────────────────────
  // System tracks: was this size category used or scrapped?
  // Allows suggestion logic without fixed threshold
}

// ── Remnant Usage History — for threshold suggestion ─────────────────────
export interface RemnantHistoryEntry {
  id: string;
  company: Company;
  thickness: string;
  sqft: number;
  outcome: 'Used' | 'Scrapped';
  daysInStock: number;            // how long before used/scrapped
  scrapReason?: string;
  recordedAt: string;
}

// ── Cutting Session — per-shift/per-job record ────────────────────────────
export interface CuttingSession {
  id: string;                     // e.g. CS-GLASSCO-0326-001
  company: Company;
  jobOrderId: string;
  cutterId: string;
  cutterName: string;
  startTime: string;
  endTime?: string;
  status: 'Open' | 'Closed';

  // ── Sheets Used ───────────────────────────────────────────────────
  sheetsScanned: {
    tagId: string;
    scannedAt: string;
    isDefective: boolean;
    lateOrMissed?: boolean;       // flag for NCR
  }[];

  // ── Output ────────────────────────────────────────────────────────
  piecesProduced: number;
  remnantsCreated: string[];      // remnant IDs
  scrapSqft: number;
  scrapWeightKg: number;

  // ── Wastage ───────────────────────────────────────────────────────
  estimatedWastagePct: number;    // from 2D algorithm at job start
  actualWastagePct?: number;      // calculated after session close
  wastageVariancePct?: number;    // actual - estimated
  supervisorSignOff?: string;     // if wastage > tolerance band
}

// ── Manual Count Sheet — physical inventory verification ─────────────────
export interface ManualCountSheet {
  id: string;                     // e.g. MCS-GLASSCO-0326-001
  company: Company;
  countDate: string;
  submittedBy: string;            // office staff who submitted
  submittedAt: string;

  items: {
    materialId: string;
    materialName: string;
    thickness: string;
    systemQty: number;            // what system shows
    physicalQty: number;          // what was counted
    systemDefective: number;
    physicalDefective: number;
    usableAreaIncharge: number;   // B6: incharge estimate of defective usable sqft
    varianceSqft: number;         // calculated: physical - system
    notes?: string;
  }[];

  // ── Sign-off ──────────────────────────────────────────────────────
  printedAt?: string;
  countRef: string;               // ref code printed on sheet
  status: 'Pending' | 'Submitted' | 'Reviewed' | 'Variance-NCR';
}

// ── Scrap Disposal Record ─────────────────────────────────────────────────
export interface ScrapDisposal {
  id: string;                     // e.g. SD-GLASSCO-0326-001
  company: Company;
  disposalDate: string;

  // ── What was scrapped ─────────────────────────────────────────────
  items: {
    materialId: string;
    thickness: string;
    estimatedSqft: number;
    estimatedWeightKg: number;
    actualWeightKg?: number;      // if weighed
  }[];

  totalEstimatedKg: number;
  totalActualKg?: number;

  // ── Valuation ─────────────────────────────────────────────────────
  // Market rate inputs (from different vendors for comparison)
  marketRates: {
    vendorName: string;
    ratePerKg: number;
  }[];
  marketRateAvgPerKg: number;     // avg of above
  defaultRatePerKg: number;       // system default PKR 5/kg

  // ── Actual deal ───────────────────────────────────────────────────
  actualDealerName?: string;
  actualAmountReceived?: number;  // lump sum
  actualRatePerKg?: number;       // calculated: actual / actual kg
  varianceFromMarket?: number;    // actual - (marketRate × kg)

  // ── IFRS Treatment ────────────────────────────────────────────────
  // Scrap income = Dr Cash / Cr Scrap Inventory (nominal) + Cr Other Income (excess)
  glJournalId?: string;
  recordedBy: string;
  notes?: string;
}

// ── Vendor Review Record ──────────────────────────────────────────────────
export interface VendorReview {
  id: string;
  company: Company;
  vendorId: string;
  vendorName: string;
  reviewDate: string;
  reviewedBy: string;
  periodFrom: string;
  periodTo: string;

  // ── Metrics snapshot ──────────────────────────────────────────────
  totalGRNs: number;
  totalSheetsReceived: number;
  totalSqftReceived: number;
  defectiveSqft: number;
  brokenSqft: number;
  defectRatePct: number;
  totalAdjustmentPKR: number;
  avgDeliveryDays: number;
  onTimeDeliveries: number;
  lateDeliveries: number;

  // ── Decision ──────────────────────────────────────────────────────
  rating: 'Excellent' | 'Good' | 'Average' | 'Poor' | 'Blacklisted';
  comments?: string;
  actionRequired?: string;
  nextReviewDate?: string;
}

// ── Pallet Rate History — tracks packing buyback rates per GRN ───────────
export interface PalletRateEntry {
  id: string;
  company: Company;
  grnId: string;
  date: string;
  vendorId: string;
  vendorName: string;
  ratePerPallet: number;
  palletCount: number;
  totalPacking: number;            // palletCount × ratePerPallet
}

// ── Weight Master Entry — per-KG weight record with history ──────────────
export interface WeightMasterEntry {
  id: string;
  company: Company;
  productId: string;
  productName: string;
  thickness: string;
  sheetSize: string;
  date: string;
  recordedBy: string;
  totalWeightKg: number;
  sheetCount: number;
  perSheetKg: number;
  sqftPerSheet: number;
  perSqftKg: number;
  source: 'GRN' | 'Manual' | 'Physical';
  grnId?: string;
  vendorId?: string;
  vendorName?: string;
  notes?: string;
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
  requiresCashPayment?: boolean;
  paymentMode?: string;           // Cash | Petty Cash | Personal Account | Bank Transfer
  materialType?: string;          // BOM Component | Consumable | Returnable Tool | Capital Asset | Profile | General
  projectId?: string;             // linked project ID for project-wise cost tracking
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

  // ── Glass PO Extensions ───────────────────────────────────────────
  vendorId?: string;
  freightType?: 'Vendor Included' | 'Own Expense';
  transportVendor?: string;
  deliveryDate?: string;
  payTerms?: string;
  headerRemarks?: string;
  totalSheets?: number;
  totalSqft?: number;
  totalFreight?: number;
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
export interface HandlingUnit { id: string; }

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
  // ── Load direction + rate (Phase 1) ────────────────────────────
  loadDirection?: 'Both' | 'OneWayLoaded' | 'OneWayEmpty';
  fullRate?: number;               // full round-trip rate
  reducedRate?: number;            // one-way empty rate (typically 50%)
}

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

// ── Stock Location — warehouse position registry ─────────────────────────
export interface StockLocation {
  id: string;                     // e.g. "LOC-001"
  company: Company;
  code: string;                   // user-entered: "A-01", "B-03", "RACK-7"
  description?: string;           // "Bay A, Row 1 — Left side"
  zone?: string;                  // optional grouping: "Bay A", "Bay B", "Yard"
  isActive: boolean;
}
