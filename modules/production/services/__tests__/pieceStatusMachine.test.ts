/**
 * pieceStatusMachine.test.ts — REAL regression net for the piece status
 * state-machine.
 *
 * This imports the ACTUAL production symbols (isTransitionAllowed,
 * PIECE_TRANSITIONS, UNIVERSAL_TRANSITIONS) from the module the app runs.
 * The deleted phase5_piece_status suite re-declared its own map and so could
 * never catch a regression in the real one — these tests assert against the
 * source of truth.
 *
 * Guards the God-mode P0: "ANY-to-ANY transition allowed" (Cut → Dispatched
 * skipping QC; Delivered → Cut). Keep in sync with the DB mirror
 * `_piece_transition_allowed` in the RBAC migration.
 */
import { describe, it, expect } from 'vitest';
import {
  isTransitionAllowed,
  PIECE_TRANSITIONS,
  UNIVERSAL_TRANSITIONS,
} from '@/modules/production/services/pieceStatusMachine';
import { PieceStatus } from '@/modules/shared/constants';

const ALL_STATUSES = Object.values(PieceStatus);

describe('pieceStatusMachine — table integrity', () => {
  it('has a transition row for every PieceStatus (no status left un-mapped)', () => {
    for (const s of ALL_STATUSES) {
      expect(PIECE_TRANSITIONS).toHaveProperty(s);
      expect(Array.isArray(PIECE_TRANSITIONS[s])).toBe(true);
    }
  });

  it('never lists a target that is not a real PieceStatus', () => {
    const valid = new Set<string>(ALL_STATUSES);
    for (const [from, targets] of Object.entries(PIECE_TRANSITIONS)) {
      for (const t of targets) {
        expect(valid.has(t), `${from} → ${t} is not a real status`).toBe(true);
      }
    }
  });

  it('does not list a universal target redundantly in a row (they are implicit)', () => {
    // Not a correctness bug, but keeps the table honest: universal targets are
    // handled by the UNIVERSAL_TRANSITIONS branch, so rows should not repeat them.
    for (const [from, targets] of Object.entries(PIECE_TRANSITIONS)) {
      for (const u of UNIVERSAL_TRANSITIONS) {
        expect(targets.includes(u), `${from} row redundantly lists universal ${u}`).toBe(false);
      }
    }
  });
});

describe('pieceStatusMachine — allowed transitions', () => {
  it('allows every forward edge declared in the table', () => {
    for (const [from, targets] of Object.entries(PIECE_TRANSITIONS)) {
      for (const to of targets) {
        expect(isTransitionAllowed(from as PieceStatus, to), `${from} → ${to}`).toBe(true);
      }
    }
  });

  it('treats same-status as a no-op (allowed) for every status', () => {
    for (const s of ALL_STATUSES) {
      expect(isTransitionAllowed(s, s), `${s} → ${s}`).toBe(true);
    }
  });

  it('allows Hold / Broken / Returned from ANY status (universal)', () => {
    for (const from of ALL_STATUSES) {
      for (const u of UNIVERSAL_TRANSITIONS) {
        expect(isTransitionAllowed(from, u), `${from} → ${u}`).toBe(true);
      }
    }
  });

  it('allows the canonical happy path Pending-Cut → … → Delivered', () => {
    const path: PieceStatus[] = [
      'Pending-Cut', 'Cut', 'QC-Pending', 'QC-Passed', 'Ready to Dispatch',
      'Dispatched', 'Received-From-Tempering', 'Ready to Dispatch', 'Delivered',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isTransitionAllowed(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });
});

describe('pieceStatusMachine — rejected transitions (the audit bugs)', () => {
  it('rejects Cut → Dispatched (cannot skip QC)', () => {
    expect(isTransitionAllowed('Cut', 'Dispatched')).toBe(false);
  });

  it('rejects Cut → Delivered (cannot skip the whole flow)', () => {
    expect(isTransitionAllowed('Cut', 'Delivered')).toBe(false);
  });

  it('rejects Pending-Cut → QC-Passed (must be cut and inspected first)', () => {
    expect(isTransitionAllowed('Pending-Cut', 'QC-Passed')).toBe(false);
  });

  it('rejects Delivered → Cut (physically impossible resurrection)', () => {
    expect(isTransitionAllowed('Delivered', 'Cut')).toBe(false);
  });

  it('Delivered is terminal except for the universal Returned/Broken', () => {
    for (const to of ALL_STATUSES) {
      const expected = to === 'Delivered' || UNIVERSAL_TRANSITIONS.includes(to);
      expect(isTransitionAllowed('Delivered', to), `Delivered → ${to}`).toBe(expected);
    }
  });

  it('Broken is terminal except for the universal allowances', () => {
    for (const to of ALL_STATUSES) {
      const expected = to === 'Broken' || UNIVERSAL_TRANSITIONS.includes(to);
      expect(isTransitionAllowed('Broken', to), `Broken → ${to}`).toBe(expected);
    }
  });

  it('rejects QC-Passed → Cut (no backward slide past QC without a return/rework path)', () => {
    expect(isTransitionAllowed('QC-Passed', 'Cut')).toBe(false);
  });
});
