/**
 * RequisitionList — Sprint 23
 *
 * Thin wrapper providing a stable import path for the requisition LIST
 * surface. The full implementation is still inside the legacy
 * `modules/procurement/pages/Requisitions.tsx` (1,837 lines) — splitting
 * that monolith line-by-line is risky for live procurement.
 *
 * This file gives external callers the right module boundary so a
 * gradual extraction can proceed without breaking imports later.
 *
 *   Phase 1 (this sprint): wrapper exports — clean public API
 *   Phase 2 (follow-up):   move the list-rendering JSX out of
 *                          Requisitions.tsx into here, drop the wrapper.
 *
 * Until phase 2 lands, importing this file is equivalent to importing
 * the monolith — same behaviour, same props (none — the list is
 * route-mounted with internal state).
 */

import React from 'react';
import RequisitionsModule from '@/modules/procurement/pages/Requisitions';

const RequisitionList: React.FC = () => {
  // The legacy module owns the entire list/form/approvals tri-pane.
  // Mounting it here keeps the surface stable while phase-2 extraction
  // is planned.
  return <RequisitionsModule />;
};

export default RequisitionList;
