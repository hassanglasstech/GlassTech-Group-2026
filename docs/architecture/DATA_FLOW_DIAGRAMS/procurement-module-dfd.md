# Procurement Module — Data Flow Diagram

```mermaid
graph TD
    REQ([Requisition: Pending]) --> REQ_APP[Requisition Approved]
    REQ_APP --> ADV{Advance needed?}
    ADV -->|Yes| GL_ADV[GL: Dr Advance / Cr Cash]
    ADV -->|No| PO_CREATE
    GL_ADV --> PO_CREATE[Create PO: Draft]
    
    PO_CREATE --> BUDGET{SCM-2: Within budget?}
    BUDGET -->|No| REJECT_BUD[Reject: BudgetExceededError]
    BUDGET -->|Yes| PO_APP[PO: Approved]
    
    PO_APP --> PO_SENT[PO: Sent to Vendor]
    PO_SENT --> GRN_REC[Goods Received]
    
    GRN_REC --> QA[Inspection Lot Created]
    QA --> QA_CHECK{SCM-1: QA values match?}
    QA_CHECK -->|No| REJECT_QA[Reject: GRNQAIntegrityError]
    QA_CHECK -->|Yes| THREE_WAY{SCM-5: 3-Way Match?}
    
    THREE_WAY -->|No| REJECT_3W[Reject: ThreeWayMatchError]
    THREE_WAY -->|Yes| GRN_POST[GRN: Posted]
    
    GRN_POST --> MAP[applyMAPOnGRN: Recalculate MAP]
    MAP --> GL_GRN[GL: Dr Inventory / Cr GR/IR]
    GRN_POST --> FREIGHT{Freight?}
    FREIGHT -->|Yes| GL_FREIGHT[GL: Dr Freight / Cr Cash]
    
    GRN_POST --> STOCK_CHECK{SCM-3: Stock sufficient?}
    STOCK_CHECK -->|Issue requested but insufficient| REJECT_STOCK[Reject: InsufficientStockError]
    
    GRN_POST --> ADV_SETTLE{Had advance?}
    ADV_SETTLE -->|Yes| GL_SETTLE[GL: Settle advance vs inventory]

    style GL_ADV fill:#f97316,color:white
    style GL_GRN fill:#f97316,color:white
    style GL_FREIGHT fill:#f97316,color:white
    style GL_SETTLE fill:#f97316,color:white
    style REJECT_BUD fill:#ef4444,color:white
    style REJECT_QA fill:#ef4444,color:white
    style REJECT_3W fill:#ef4444,color:white
    style REJECT_STOCK fill:#ef4444,color:white
```

**Files:** inventoryService.ts, grnService.ts, grnGLService.ts, glasscoGLService.ts
**Tables:** requisitions, purchase_orders, grn_sheet_entries, store_items, stock_ledger, inspection_lots, handling_units
