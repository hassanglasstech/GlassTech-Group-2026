// ── NCR (Non-Conformance Report) Types ───────────────────────────────
// Glass Breakage Management System — GlassTech ERP 2026

export type NCRStage =
  | 'Cutting'
  | 'Grinding'
  | 'Drilling'
  | 'Handling'
  | 'Tempering-Transit'
  | 'Inward-Inspection'
  | 'Warehouse'
  | 'Loading'
  | 'Site';

export type NCRCause =
  | 'BR-01-Operator-Error'
  | 'BR-02-Machine-Fault'
  | 'BR-03-Handling-Accident'
  | 'BR-04-Raw-Material-Defect'
  | 'BR-05-Thermal-Shock'
  | 'BR-06-Edge-Damage'
  | 'BR-07-Transport-Damage';

export type NCRAction = 'Dispose' | 'Reproduce' | 'Vendor-Claim';

export type NCRStatus =
  | 'Open'
  | 'Reproduce-Pending'
  | 'Reproduce-InProgress'
  | 'Reproduce-Done'
  | 'Claim-Pending'
  | 'Claim-Settled'
  | 'Closed';

export type ClaimStatus =
  | 'Draft'
  | 'Submitted'
  | 'Acknowledged'
  | 'Accepted'
  | 'Partial'
  | 'Rejected'
  | 'Settled';

// ── NCR_CAUSE_LABELS ─────────────────────────────────────────────────
export const NCR_CAUSE_LABELS: Record<NCRCause, string> = {
  'BR-01-Operator-Error':    'BR-01 — Operator Error',
  'BR-02-Machine-Fault':     'BR-02 — Machine / Equipment Fault',
  'BR-03-Handling-Accident': 'BR-03 — Handling Accident',
  'BR-04-Raw-Material-Defect': 'BR-04 — Raw Material Defect',
  'BR-05-Thermal-Shock':     'BR-05 — Thermal Shock (Tempering)',
  'BR-06-Edge-Damage':       'BR-06 — Edge / Grinding Damage',
  'BR-07-Transport-Damage':  'BR-07 — Transport / Loading Damage',
};

export const NCR_STAGE_LABELS: Record<NCRStage, string> = {
  'Cutting':           '✂️ Cutting',
  'Grinding':          '🔧 Grinding / Polishing',
  'Drilling':          '🔩 Drilling / Notching',
  'Handling':          '🤲 In-House Handling',
  'Tempering-Transit': '🚛 Tempering Transit',
  'Inward-Inspection': '📦 Inward Inspection (Raw Glass)',
  'Warehouse':         '🏭 Warehouse',
  'Loading':           '🚚 Loading / Dispatch',
  'Site':              '🏗️ Site Installation',
};

// ── Main NCR Record ──────────────────────────────────────────────────
export interface NCREvent {
  id: string;                      // NCR-YYYYMMDD-XXXX
  company: string;
  pieceId?: string;                // linked piece (if exists)
  jobOrderId?: string;             // linked job/quotation
  itemIndex?: number;              // item within job order
  
  // Breakage details
  stage: NCRStage;
  cause: NCRCause;
  description: string;             // free text
  reportedBy: string;
  reportedAt: string;              // ISO datetime
  
  // Loss calculation
  sqftLost: number;
  glassType?: string;
  thickness?: string;
  estimatedValue: number;          // PKR
  
  // Action taken
  action: NCRAction;
  status: NCRStatus;
  
  // If Raw Material defect — vendor claim possible
  vendorId?: string;
  vendorName?: string;
  purchaseRef?: string;            // PO or GRN reference
  
  // GL entry reference
  glEntryId?: string;
  
  // Photos (base64 or filenames)
  photos?: string[];
  
  notes?: string;
  closedAt?: string;
  closedBy?: string;
}

// ── Reproduction Order ───────────────────────────────────────────────
export interface NCRReproduction {
  id: string;                      // REPR-XXXX
  ncrId: string;
  company: string;
  jobOrderId: string;
  itemIndex: number;
  
  originalPieceId?: string;
  newPieceId?: string;             // set when new piece is created
  
  priority: 'Normal' | 'High' | 'Urgent';
  status: 'Queued' | 'In-Production' | 'Completed' | 'Cancelled';
  
  extraCost: number;               // additional material cost
  materialCost?: number;           // actual material consumed (sqft * MAP) — set on completion
  materialRef?: string;            // cutting session reference that consumed the sheet
  notes?: string;

  createdAt: string;
  completedAt?: string;
}

// ── Vendor Claim (Raw Material) ──────────────────────────────────────
export interface NCRVendorClaim {
  id: string;                      // CLM-XXXX
  ncrId: string;
  company: string;
  vendorId: string;
  vendorName: string;
  
  claimDate: string;
  claimAmount: number;
  description: string;
  
  // Evidence
  photos?: string[];
  purchaseRef?: string;
  
  status: ClaimStatus;
  settledAmount?: number;
  settledDate?: string;
  rejectionReason?: string;
  
  // GL
  glDebitNoteId?: string;
  
  notes?: string;
}

// ── Scrap / Remnant (from breakage) ─────────────────────────────────
export interface BreakageRemnant {
  id: string;
  ncrId: string;
  company: string;
  
  glassType: string;
  thickness: string;
  estimatedKg: number;             // weight estimate
  sqft: number;
  
  disposalMethod: 'Bin' | 'Sold-as-Scrap' | 'Reuse-Internal';
  scrapValue: number;              // if sold
  
  date: string;
  notes?: string;
}
