# Sales Module — Data Flow Diagram

```mermaid
graph TD
    START([Client Request]) --> Q_CREATE[Create Quotation]
    Q_CREATE --> V_SAL1{SAL-1: Discount valid?}
    V_SAL1 -->|No: discount > subtotal| REJECT_DISC[Reject: Discount exceeds subtotal]
    V_SAL1 -->|Yes| Q_DRAFT[Status: Draft]
    
    Q_DRAFT --> Q_SEND[Send to Client]
    Q_SEND --> Q_SENT[Status: Sent]
    
    Q_SENT --> DECISION{Client Decision}
    DECISION -->|Rejected| Q_REJ[Status: Rejected]
    DECISION -->|Approved| Q_APP[Status: Approved]
    
    Q_APP --> JO_CREATE[gtkJobOrderService.convertQuotationToJobOrder]
    JO_CREATE --> JO_OPEN[Job Order: Open]
    JO_CREATE --> PIECES[Production Pieces: Pending]
    
    Q_APP --> INV_CREATE[Create Invoice]
    INV_CREATE --> INV_DRAFT[Invoice: Draft]
    INV_DRAFT --> INV_POST[Post Invoice]
    INV_POST --> GL_INV[GL: Dr AR 1310 / Cr Revenue 4110]
    GL_INV --> INV_OUT[Invoice: Outstanding]
    
    INV_OUT --> PMT[Payment Receipt]
    PMT --> GL_PMT[GL: Dr Cash / Cr AR]
    GL_PMT --> INV_PAID[Invoice: Paid]
    
    INV_OUT --> CN[Credit Note]
    CN --> GL_CN[GL: Dr Returns 4120 / Cr AR 1310]

    style GL_INV fill:#f97316,color:white
    style GL_PMT fill:#f97316,color:white
    style GL_CN fill:#f97316,color:white
    style REJECT_DISC fill:#ef4444,color:white
    style Q_REJ fill:#ef4444,color:white
```

**Files:** salesService.ts, gtkJobOrderService.ts, deliveryInvoiceService.ts, creditNoteService.ts
**Tables:** quotations, clients, invoices, payment_receipts, projects
