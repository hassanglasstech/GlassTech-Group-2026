# Cutting / Production Module — Data Flow Diagram

```mermaid
graph TD
    JO([Job Order: Open]) --> MFG1{MFG-1: Order exists in quotations?}
    MFG1 -->|No| GHOST[Reject: GhostOrderError]
    MFG1 -->|Yes| PIECES[Create Pieces: Pending]
    
    PIECES --> CUT[Cutting Session]
    CUT --> CUT_DONE[Piece: Done]
    CUT --> DEFECT{Defect found?}
    
    DEFECT -->|Yes| NCR_CREATE[Create NCR]
    DEFECT -->|No| CUT_DONE
    
    NCR_CREATE --> NCR_ACTION{NCR Action?}
    
    NCR_ACTION -->|Dispose| BROKEN[Piece: Broken]
    BROKEN --> GL_WRITEOFF[GL: Dr Breakage Loss / Cr WIP]
    
    NCR_ACTION -->|Reproduce| REPRO[Reproduction: Queued]
    REPRO --> REPRO_DONE[New Piece Created]
    REPRO_DONE --> NCR_CLOSED[NCR: Reproduce-Done]
    
    NCR_ACTION -->|Vendor-Claim| CLAIM[Claim: Draft]
    CLAIM --> CLAIM_SETTLE[Claim Settled]
    CLAIM_SETTLE --> GL_CLAIM[GL: Dr Cash / Cr Vendor Recovery]
    CLAIM_SETTLE --> NCR_SETTLED[NCR: Claim-Settled]
    
    CUT_DONE --> DISPATCH{Dispatch type?}
    DISPATCH -->|Tempering| TEMP[Tempering Dispatch]
    TEMP --> TEMP_DONE[Tempering Complete]
    DISPATCH -->|Direct| READY[Ready to Dispatch]
    TEMP_DONE --> READY
    
    READY --> GATE[Gate Pass]
    GATE --> DELIVERED[Piece: Delivered]

    style GL_WRITEOFF fill:#f97316,color:white
    style GL_CLAIM fill:#f97316,color:white
    style GHOST fill:#ef4444,color:white
    style BROKEN fill:#ef4444,color:white
```

**Files:** productionService.ts, ncrService.ts, productionCostService.ts
**Tables:** production_pieces, job_orders, cutting_sessions, ncr_events, ncr_claims, ncr_reproductions, gate_passes, tempering_dispatches
