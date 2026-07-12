/**
 * pieceStatusMachine.ts — the production piece status state-machine (pure).
 *
 * Extracted from ProductionContext so the transition rules can be
 * regression-tested against the REAL table (not a re-implemented copy — that
 * was the flaw in the deleted phase5_piece_status shadow suite, which encoded
 * its own contradicting map and therefore proved nothing about production).
 *
 * This module has ZERO runtime dependencies beyond the PieceStatus union, so
 * it is trivially importable in a unit test without pulling in supabase, the
 * auth store, sonner, or the whole React component tree.
 *
 * Audit context (God-mode P0): ANY-to-ANY transitions were previously allowed,
 * so a piece could jump Cut → Dispatched (skipping QC) or Delivered → Cut
 * (physically impossible). The map below codifies the only legitimate forward
 * and corrective transitions. The DB mirror is `_piece_transition_allowed`
 * (migration) guarding `update_piece_status_atomic`; keep the two in sync.
 */
import { PieceStatus } from '@/modules/shared/constants';

// Universal allowances (legal FROM any status):
//   • 'Hold'     — operator parks a piece for any reason
//   • 'Broken'   — NCR can void a piece at any stage
//   • 'Returned' — customer/vendor return at any stage (rare, but legal)
export const UNIVERSAL_TRANSITIONS: PieceStatus[] = ['Hold', 'Broken', 'Returned'];

export const PIECE_TRANSITIONS: Record<PieceStatus, PieceStatus[]> = {
  'Pending-Cut':               ['Cut'],                               // awaiting cutting → cut
  'Cut':                       ['Service-Pending', 'QC-Pending', 'QC-Failed'],
  'Service-Pending':           ['QC-Pending', 'Cut', 'QC-Failed'],
  'QC-Pending':                ['QC-Passed', 'QC-Failed', 'Service-Pending'],
  'QC-Failed':                 ['Cut', 'Service-Pending'],            // rework path
  'QC-Passed':                 ['Ready to Dispatch', 'Dispatched', 'Delivered'],
  'Ready to Dispatch':         ['Dispatched', 'Delivered', 'QC-Passed'],
  'Dispatched':                ['Tempered', 'Received-From-Tempering', 'Ready to Dispatch'],
  'Tempered':                  ['Ready to Dispatch', 'Received-From-Tempering', 'Delivered', 'QC-Pending'],
  'Received-From-Tempering':   ['Ready to Dispatch', 'Tempered', 'QC-Pending'],
  'Delivered':                 [],                                    // ← terminal except universal
  'Returned':                  ['Cut'],                               // rework after return
  'Broken':                    [],                                    // terminal
  'Hold':                      ['Cut', 'Service-Pending', 'QC-Pending', 'QC-Passed', 'Ready to Dispatch', 'Dispatched', 'Tempered', 'Received-From-Tempering'],
};

/**
 * True when a piece may legally move `from` → `to`.
 *  - same status is a no-op (e.g. warehouse-spot reassignment) → allowed
 *  - any UNIVERSAL_TRANSITIONS target is always allowed
 *  - otherwise the target must be in the from-row's allow-list
 */
export const isTransitionAllowed = (from: PieceStatus, to: PieceStatus): boolean => {
  if (from === to) return true;
  if (UNIVERSAL_TRANSITIONS.includes(to)) return true;
  return (PIECE_TRANSITIONS[from] || []).includes(to);
};
