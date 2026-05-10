/**
 * RequisitionForm — Sprint 23
 *
 * Module boundary for the requisition CREATION / EDIT surface. Currently
 * a thin re-export pointing at the legacy Requisitions monolith (form
 * lives inline there). Once the monolith is split (phase-2), the form
 * JSX moves into this file and the legacy import is removed.
 *
 * Why a wrapper today:
 *   - External callers can already import from
 *     '@/modules/procurement/components/requisitions/RequisitionForm'
 *     without knowing whether the form is inside the monolith or not
 *   - Cuts the future move to a 1-line change here, no consumer churn
 */

import React from 'react';
import RequisitionsModule from '@/modules/procurement/pages/Requisitions';

const RequisitionForm: React.FC = () => {
  // Phase-1 wrapper — see RequisitionList.tsx header comment for plan.
  // Mounting the full module is a no-op visually because the form is
  // gated by an internal `creating`/`editing` flag inside the monolith.
  return <RequisitionsModule />;
};

export default RequisitionForm;
