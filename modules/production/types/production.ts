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
  /** SERVICE ONLY (client-supplied glass): the client brings their own glass and
   *  Glassco performs only services (grinding/beveling/tempering). The line is
   *  priced at service rates only (NO glass base rate), pieces still generate for
   *  tracking, but NO glass is consumed from inventory and delivery books NO
   *  raw-glass COGS / inventory relief — only service labour (+ vendor tempering AP). */
  serviceOnly?: boolean;
  notchCount?: number;
  holes?: HoleLocation[]; 
  attachedImage?: string; 
  attachmentName?: string; 
  isSection?: boolean; 
  totalSqFt: number;
  pricePerUnit: number;
  /** Legacy alias for pricePerUnit — 18+ runtime call sites use this name.
   *  Keep both until call sites are migrated to pricePerUnit. */
  rate?: number;
  /** Legacy alias for totalSqFt used by some UI code. */
  sqft?: number;
  /** Legacy alias for glassSize — 7+ call sites use this name. */
  glassThickness?: string;
  /** Shape selector used in QuotationManager.tsx UI (Rectangle/Circle). */
  shape?: 'Rectangle' | 'Circle' | string;
  /** Base64/URL of attached design image — used in QuotationManager.tsx. */
  designFile?: string;
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
  notchCharges?: number;
  drawingNote?: string;
  /** Nippon: stores the product.id (NIP-KL-...) for inventory lookup.
   *  locationCode is repurposed to hold the visible model_no on Nippon quotes. */
  productRef?: string;
  /** Nippon set-feature flags carried at runtime: header row + member lines of a product set. */
  isSetHeader?: boolean;
  isSetMember?: boolean;
  setId?: string;
  /** Nippon: this single line is given as a sample (free) — amount forced to 0,
   *  stock still moves, printed with a SAMPLE tag. Separate from the whole-quote
   *  Sample toggle (Quotation.isSample). */
  isSample?: boolean;
  // ── Gate Pass A (store pick) — per-line pick data, round-trips via items jsonb ──
  /** WMS bin the store picks this line from. Seeded from the product's store bin
   *  (store_items.storage_bin); the store can override per line. */
  binLocation?: string;
  /** Qty the store physically picked (partial-pick support). Undefined = not yet
   *  picked; defaults to the ordered qty when the picker opens the line. */
  pickedQty?: number;
  /** Store incharge's note for this line ("2 pcs damaged, substituted"). */
  storeNote?: string;
}

export interface GlassServiceCharge {
  description: string;
  amount: number;
}

/**
 * Gate Pass B — an order's gate pass. Issued by the office from an issued/staged
 * order, QR-verified, and pushed cross-company to the Factory gatekeeper who
 * stamps IN/OUT at the shared gate. Rides on the order's `data` jsonb (no schema
 * change); the qrToken is what the gatekeeper scans to authorise the goods.
 */
export interface GatePassInfo {
  qrToken: string;              // scanned by the gatekeeper to verify the pass
  vehicleNo: string;
  driverName: string;
  driverPhone?: string;
  isReturnable: boolean;        // vehicle/goods expected back (gate-in-back)
  instructions?: string;        // driver / gate instructions (Urdu slip in phase D)
  issuedAt: string;             // ISO
  issuedBy: string;
  status: 'Issued' | 'GateIn' | 'GateOut' | 'Returned';
  gateInAt?: string;            // stamped by the gatekeeper (the tap IS the record)
  gateOutAt?: string;
  returnedAt?: string;
  // Factory gatekeeper approval — the guard verifies against the physical gate pass,
  // approves it and uploads a photo of the paper slip (base64 data URI).
  approvedAt?: string;
  approvedBy?: string;
  photoUrl?: string;
}

export interface Quotation {
  id: string;
  orderNo?: string;
  invoiceNo?: string;
  company: Company;
  date: string;
  clientId: string;
  // Sprint 2 — optimistic concurrency. Server-bumped on each write via
  // update_with_version RPC. Stale value → save throws version_conflict.
  version?: number;
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
  expiryDate?: string;        // YYYY-MM-DD — quotation valid until
  lostReason?: string;         // why quotation was lost
  attachments?: string[]; 
  revisedFields?: string[];
  manualSerial?: string; 
  isAlreadyDispatched?: boolean; 
  receivedAmount?: number; 
  actualDeliveryDate?: string;
  /** Cutter assigned to this job order (consolidated-branch cutter-tracking overlay). */
  assignedCutter?: string;
  /** Production job-order status, set on the Job Orders board (P1b). 'Void' is
   *  auto-derived when the SO itself is voided; Active/Pending/Hold are set in
   *  production. Undefined is treated as 'Active' (default in-production). */
  jobStatus?: 'Active' | 'Pending' | 'Hold' | 'Void';
  delayReason?: string;
  delayCategory?: 'Internal' | 'Outsourcing' | 'Client' | '';
  // Sample tracking (Nippon): a sample sent to a client, either charged or free.
  // Free samples ride the discount mechanism (100% → net 0) so stock still moves
  // but revenue is 0. Kept as a flag so samples-per-client can be reported.
  isSample?: boolean;
  sampleType?: 'Paid' | 'Free';
  // Replacement order fields (post-delivery customer breakage)
  orderType?: 'Standard' | 'Replacement';
  originalOrderRef?: string;       // original quotation/SO ID
  replacementReason?: string;      // 'Customer Breakage'
  costBearer?: 'Customer' | 'GlassCo';

  // ── Intercompany P2 — order-time mirror tag. When a GTK/GTI project raises an
  //    IC material demand, a tagged Sales Order is created in the SUPPLIER company
  //    (Glassco/Nippon) so it appears in their Sales + Store queue immediately.
  //    One order, two lenses (Sales Order for the seller, Project Purchase for the
  //    buyer). Round-trips via the quotations `data` jsonb blob (no schema change). ──
  /** Customer portal — this quotation was placed by the customer themselves via
   *  the self-service portal (Draft, awaiting Nippon review). Round-trips via data jsonb. */
  customerPlaced?: boolean;
  // ── Customer-portal order-lifecycle timestamps (ISO). All ride in the
  //    quotations `data` jsonb (no migration) so the customer sees each milestone
  //    with a time, in separate columns, as the order moves through the desk. ──
  /** Customer submitted the query via the self-service portal. */
  queryPlacedAt?: string;
  /** Nippon desk prepared the query into a real quotation (PDF now downloadable). */
  quotedAt?: string;
  /** Order approved / confirmed by the desk. */
  approvedAt?: string;
  /** Goods issued from the store / out for delivery. */
  dispatchedAt?: string;
  /** Store-issue audit stamp — goods physically left (mirrors dispatchedAt). */
  issuedAt?: string;
  issuedBy?: string;
  // ── Nippon payment loop (hard gate: office must confirm payment before the
  //    order can be approved/sent to store). All ride in the quotations data jsonb. ──
  /** Customer accepted the quotation in the portal (before paying). */
  accepted?: boolean;
  acceptedAt?: string;
  /** Customer-uploaded payment proof (screenshot as a base64 data URI). */
  paymentProof?: string;
  /** Amount the customer SAYS they paid (a CLAIM — the owner's receipt is the record). */
  paymentClaimAmount?: number;
  /** Customer marked the order paid + uploaded proof (portal). */
  paymentSubmittedAt?: string;
  /** Office verified the payment actually arrived — unblocks approval. */
  paymentConfirmed?: boolean;
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: string;
  // ── Gate pass is REQUESTED by the store, then ISSUED by the office in Logistics. ──
  /** Store asked the office to issue a gate pass for this (delivered/ready) order. */
  gatePassRequested?: boolean;
  gatePassRequestedAt?: string;
  gatePassRequestedBy?: string;
  /** True when this Sales Order was raised by another group company's project. */
  intercompany?: boolean;
  /** The buyer company that raised it (e.g. 'GTK'). */
  sourceCompany?: Company;
  /** The buyer's project this demand belongs to (for project-cost roll-up). */
  sourceProjectId?: string;
  /** The buyer's project title (denormalised for display on the seller side). */
  sourceProjectTitle?: string;

  // ── Gate Pass A/B (fulfilment) — order-level pick + dispatch data. Round-trips
  //    via the quotations `data` jsonb blob (no schema change). ──
  /** Office → store/driver instructions that ride the order (fragile / call-before
   *  / partial-ok / deliver-by). One thread from office to the gate. */
  specialInstructions?: string;
  /** Fulfilment priority — Urgent floats the order to the top of the pick queue. */
  priority?: 'Normal' | 'Urgent';
  /** Store pick progress: Pending (untouched) → Picking (progress saved) → Picked. */
  pickStatus?: 'Pending' | 'Picking' | 'Picked';
  /** Who saved the last pick progress / completed the pick. */
  pickedBy?: string;
  /** ISO timestamp of the last pick save / completion. */
  pickedAt?: string;
  /** Gate Pass B — the gate pass issued for this order (QR-verified, cross-company
   *  pushed to the Factory gatekeeper). Rides in the quotations `data` jsonb. */
  gatePass?: GatePassInfo;

  // Wastage analysis decision (saved at quotation time)
  wastageDecision?: {
    actualWastagePct: number;
    historicalAvgPct: number | null;
    industryBenchmarkPct: number;
    suggestedRateIncrementPct: number;     // e.g. 8.5 = 8.5% increase
    suggestedNewRatePerSqft: number | null; // computed suggestion
    decision: 'approve' | 'review' | 'override';
    overrideNote: string;
    approvedAt: string;                    // ISO timestamp
    sheetsRequired: number;
    selectedSheetSize: string;             // e.g. "84x144"
  };
}

export type JobOrder = Quotation;

export interface PieceFault {
  id: string;
  description: string;
  reportedAt: string;
  disposal: 'None' | 'Recut' | 'Accepted';
  costImpact?: number;
  /** Track 2.1 — where the defect originated, for quality attribution on the
   *  floor board. Distinguishes a cutter miscut from tempering breakage or
   *  in-house handling damage so the board can say WHY a piece failed. */
  origin?: 'Cutting' | 'Service' | 'Tempering' | 'Handling' | 'QC' | 'Client' | 'Unknown';
}

// ── Service Log — one entry per service performed on a piece ────────
export interface ServiceLogEntry {
  serviceNick: string;      // 'Polishing' | 'Grinding' | 'Notching' | 'Holes' | 'T/G' etc.
  workerId?: string;
  workerName: string;
  sqft: number;             // sqft processed by this worker for this service on this piece
  costRatePerSqft: number;  // PKR/sqft standard cost (from Product Master or standard rates)
  totalCost: number;        // sqft × costRatePerSqft
  completedAt: string;      // ISO timestamp
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
  // Sprint 2 — optimistic concurrency
  version?: number;
  // Sprint 5 — Hold-state asymmetry fix.
  // When a piece is moved to status='Hold', `holdFrom` snapshots the
  // origin status; when it leaves Hold the only legal exit is back to
  // `holdFrom` (or the universal Broken/Returned). Cleared on exit.
  holdFrom?: PieceStatus;
  fault?: PieceFault;
  pendingServices?: string[];
  isRevised?: boolean;
  revisionNote?: string;
  /** Mirrors the quotation item's serviceOnly flag (client-supplied glass): this
   *  piece consumes no glass inventory and books no raw-glass COGS at delivery. */
  serviceOnly?: boolean;
  sqft?: number;            // area of this piece (sqft) — populated at creation from quotation item
  serviceLog?: ServiceLogEntry[]; // history of services performed + worker + cost
  // ── Consolidated-branch fields (optional; cutter-tracking overlay) ──
  /** Company owning this piece — denormalized for cross-company logistics screens. */
  company?: Company;
  /** Employee/cutter id who cut this piece. */
  cutBy?: string;
  /** ISO timestamp when the piece was cut. */
  cutAt?: string;
  /** Total sqft alias used by dispatch/logistics screens (mirrors `sqft`). */
  totalSqFt?: number;
  // ── Track 2.1 — per-piece assignment & fault overlay ────────────────
  //   All nullable. These ride the production_pieces.data jsonb via the
  //   update_piece_status_atomic p_extra merge (046/083) — NO new columns,
  //   NO GL, piece.id untouched. Job-level assignment (Quotation.assignedCutter)
  //   stays the source of truth until a piece is individually (re)assigned;
  //   then these piece-level fields take precedence and let the floor board
  //   show per-piece ownership + a reassigned piece on both cutters' lanes.
  /** Cutter this specific piece is (re)assigned to. Overrides the job-level
   *  Quotation.assignedCutter once set (D2 reassign / D1 supervisor-logs). */
  assignedCutter?: string;
  /** Cutters who previously held this piece before a reassign, oldest→newest —
   *  keeps the piece visible in a previous cutter's history/lane. */
  prevCutters?: string[];
  /** ISO timestamp of the current assignment. */
  assignedAt?: string;
  /** Who performed the assignment (supervisor email) — the "logged on behalf"
   *  actor for D1 attribution, distinct from assignedCutter (the credited cutter). */
  assignedBy?: string;
  /** Full defect history (`fault` is the latest) — enables recut/rework audit and
   *  quality-rate attribution without losing prior faults. */
  faultHistory?: PieceFault[];
  /** Why this piece is currently blocked/held — surfaced on the board's blocked
   *  lane so a pile-up shows its cause. */
  blockedReason?: string;
  /** Delivery-commitment basis of the parent order — drives the AT-RISK gate.
   *  Firm = promised date, Estimate = soft, Flexible = no committed date. */
  commitmentType?: 'Firm' | 'Estimate' | 'Flexible';
  // ── Barcode / QR (Task 4 — Phase 9) ─────────────────────────────
  /**
   * Barcode / QR string printed on the job card and the physical glass sticker.
   * Scanned at each production stage (Cut → Edging → Tempering → QA → Warehouse)
   * to update piece status without manual data entry on the shop floor.
   */
  barcode?: string;
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
  chargesPerSqFt: number;              // flat display / fallback value
  ratesByMm?: Record<string, number>;  // per-mm rates snapshotted from vendor price list at dispatch time
                                       // e.g. { '6': 55, '8': 65, '10': 75, '12': 85 }
  totalCharges: number;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  signedCopyReceived?: boolean;       // customer's signed delivery-challan copy returned + filed?
  signedCopyReceivedDate?: string;
  receivedPieceIds?: string[];

  // ── Sprint 11: Atomic dispatch + 3-way match ────────────────────────
  /** Mandatory before status='Dispatched' — DB FK to gate_passes.id */
  gatePassId?:           string;
  /** Vendor's invoice number (entered when invoice arrives) */
  vendorInvoiceNo?:      string;
  /** Vendor's invoice total (PKR) — compared to computed AP for 3-way match */
  vendorInvoiceAmount?:  number;
  /** Auto-set by record_three_way_match RPC: Match (Δ ≤ 5 %), Mismatch (Δ > 5 %), Pending */
  threeWayMatchStatus?:  'Match' | 'Mismatch' | 'Pending';
  /** Pieces broken or lost in transit — separate from receivedPieceIds */
  brokenPieceIds?:       string[];
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

// ── Floor Staff — production team member overlay on Employee ────────────
export type FloorRole = 'Cutter' | 'Helper' | 'Polish Operator' | 'Machine Operator' | 'Supervisor';
export type SkillGrade = 'A+' | 'A' | 'B' | 'C';

export interface FloorStaff {
  id: string;
  company: Company;
  employeeId: string;
  name: string;
  photoUrl?: string;
  role: FloorRole;
  skillGrade: SkillGrade;
  avgSqftPerHour: number;         // auto-calculated from actuals
  manualSqftPerHour: number;      // initial manual entry
  isActive: boolean;
}

// ── Cutting Table — physical work station ───────────────────────────────
export interface CuttingTable {
  id: string;
  company: Company;
  label: string;                   // "Table 1", "Table 2", "Table 3"
  status: 'Active' | 'Maintenance';
}

// ── Daily Floor Plan — team assignment + order queue per table ───────────
export interface DailyFloorPlan {
  id: string;
  company: Company;
  date: string;
  tables: {
    tableId: string;
    teamStaffIds: string[];
    queue: {
      orderId: string;
      orderRef: string;
      clientName: string;
      sqft: number;
      pieceCount: number;
      priority: 'Normal' | 'Urgent' | 'Emergency';
      estimatedMinutes: number;
      actualMinutes?: number;
      status: 'Pending' | 'Cutting' | 'Done';
      startedAt?: string;
      completedAt?: string;
    }[];
  }[];
  status: 'Draft' | 'Active' | 'Completed';
  createdBy: string;
  approvedBy?: string;
}

// ── Simulation Result — what-if analysis before execution ───────────────
export interface SimulationResult {
  id: string;
  planId: string;
  timestamp: string;
  tables: {
    tableId: string;
    tableLabel: string;
    estimatedFinishTime: string;
    totalSqft: number;
    totalMinutes: number;
    utilizationPct: number;
  }[];
  alerts: string[];
  impactIfUrgentInserted?: {
    urgentOrderId: string;
    targetTableId: string;
    delayedOrders: { orderId: string; orderRef: string; delayMinutes: number }[];
  };
}
