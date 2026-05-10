/**
 * RequisitionApprovals — Sprint 23
 *
 * Module boundary for the requisition APPROVAL queue (release strategy).
 * Same wrapper pattern as RequisitionList / RequisitionForm — gives
 * external callers a stable import while the monolith is being split
 * over follow-up sprints.
 */

import React from 'react';
import RequisitionsModule from '@/modules/procurement/pages/Requisitions';

const RequisitionApprovals: React.FC = () => {
  // Phase-1 wrapper. Approval queue currently lives inside the
  // Requisitions monolith and is filtered to status='Pending Approval'
  // for the relevant role. When phase-2 extracts it, the approval
  // panel + queue list move into this file.
  return <RequisitionsModule />;
};

export default RequisitionApprovals;
