
export const Company = {
  GTK: 'GTK',
  GTI: 'GTI',
  GLASSCO: 'Glassco',
  NIPPON: 'Nippon',
  FACTORY: 'Factory',
} as const;
export type Company = typeof Company[keyof typeof Company];

export const PieceStatus = {
  // Consolidated cutter-workflow: piece created at approval, awaiting cutting.
  PENDING_CUT: 'Pending-Cut',
  CUT: 'Cut',
  SERVICE_PENDING: 'Service-Pending',
  QC_PENDING: 'QC-Pending',
  QC_FAILED: 'QC-Failed',
  QC_PASSED: 'QC-Passed',
  READY_TO_DISPATCH: 'Ready to Dispatch',
  DISPATCHED: 'Dispatched',
  TEMPERED: 'Tempered',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned',
  BROKEN: 'Broken',
  HOLD: 'Hold',
  RECEIVED_FROM_TEMPERING: 'Received-From-Tempering'
} as const;
export type PieceStatus = typeof PieceStatus[keyof typeof PieceStatus];

export const QuotationStatus = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  // Trading fulfilment (Nippon): an approved order whose goods have physically
  // been issued from the store. A real terminal-ish order state — it must be
  // recognized so a delivered order stays in the ORDER lists and is not
  // mis-bucketed back into "quotations".
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  PARTIAL: 'Partial Payment',
  PAID: 'Paid',
  LOST: 'Lost',
  EXPIRED: 'Expired',
  VOID: 'Void',
} as const;
export type QuotationStatus = typeof QuotationStatus[keyof typeof QuotationStatus];

export const ProjectStatus = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ON_HOLD: 'On-Hold'
} as const;
export type ProjectStatus = typeof ProjectStatus[keyof typeof ProjectStatus];

export const TemperingDispatchStatus = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  READY_TO_DISPATCH: 'Ready to Dispatch',
  DISPATCHED: 'Dispatched',
  RECEIVED: 'Received'
} as const;
export type TemperingDispatchStatus = typeof TemperingDispatchStatus[keyof typeof TemperingDispatchStatus];

export const LedgerStatus = {
  POSTED: 'Posted',
  PARKED: 'Parked'
} as const;
export type LedgerStatus = typeof LedgerStatus[keyof typeof LedgerStatus];

export const AttendanceStatus = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  LEAVE: 'Leave'
} as const;
export type AttendanceStatus = typeof AttendanceStatus[keyof typeof AttendanceStatus];

export const LoanStatus = {
  ACTIVE: 'Active',
  PAID: 'Paid'
} as const;
export type LoanStatus = typeof LoanStatus[keyof typeof LoanStatus];

export const RequisitionStatus = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  CONVERTED_TO_PO: 'Converted to PO',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
  PAID: 'Paid'
} as const;
export type RequisitionStatus = typeof RequisitionStatus[keyof typeof RequisitionStatus];

export const PurchaseOrderStatus = {
  SENT: 'Sent',
  RECEIVED: 'Received',
  GRN_PENDING: 'GRN Pending',
  GRN_DONE: 'GRN Done',
  INVOICE_PENDING: 'Invoice Pending',
  MATCHED: 'Matched',
  PAYMENT_PENDING: 'Payment Pending',
  PAID: 'Paid',
  IN_PRODUCTION: 'In Production',
  DELIVERED: 'Delivered',
  ON_HOLD: 'On Hold'
} as const;
export type PurchaseOrderStatus = typeof PurchaseOrderStatus[keyof typeof PurchaseOrderStatus];

export const ApprovalLevel = {
  L1: 'L1',   // Department Manager  < 100k
  L2: 'L2',   // Director / GM       100k – 500k
  L3: 'L3',   // MD / CEO            > 500k
} as const;
export type ApprovalLevel = typeof ApprovalLevel[keyof typeof ApprovalLevel];

export const MatchStatus = {
  PENDING: 'Pending',
  TWO_WAY: '2-Way',
  THREE_WAY: '3-Way',
  MISMATCH: 'Mismatch',
  ON_HOLD: 'On-Hold',
} as const;
export type MatchStatus = typeof MatchStatus[keyof typeof MatchStatus];

export const ClientStatus = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive'
} as const;
export type ClientStatus = typeof ClientStatus[keyof typeof ClientStatus];

export const VendorType = {
  TEMPERING: 'Tempering',
  LAMINATION: 'Lamination',
  DOUBLE_GLAZING: 'Double Glazing',
  GLASS: 'Glass',            // "Raw Glass (supply)" in UI — purchase/GRN track
  TRANSPORT: 'Transport',
  HARDWARE: 'Hardware',
  PROFILE: 'Profile',
  GENERAL: 'General',
  CRANE: 'Crane/Unloading',
  LABOUR: 'Labour',
} as const;

// The 4 Glassco vendor categories for the unified rate-comparison chart.
// The 3 outsource services (pieces go out → come back) vs Raw Glass (we buy in).
export const GLASSCO_SERVICE_VENDOR_TYPES: VendorType[] = ['Tempering', 'Lamination', 'Double Glazing'];
export const GLASSCO_RATE_CHART_CATEGORIES: VendorType[] = ['Tempering', 'Lamination', 'Double Glazing', 'Glass'];
export type VendorType = typeof VendorType[keyof typeof VendorType];
