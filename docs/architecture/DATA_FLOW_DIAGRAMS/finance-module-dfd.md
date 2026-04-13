# Finance Module — Data Flow Diagram

```mermaid
graph TD
    subgraph Auto GL Entries
        TRIGGER([GL Posting from other modules]) --> RECORD[recordTransaction]
        RECORD --> PERIOD{Period open?}
        PERIOD -->|No| REJECT_PERIOD[Reject: Period closed]
        PERIOD -->|Yes| BAL_CHECK{FIN-3: Debits = Credits?}
        BAL_CHECK -->|No| REJECT_BAL[Reject: LedgerImbalanceError]
        BAL_CHECK -->|Yes| POSTED_AUTO[Status: Posted]
    end

    subgraph Manual JV Workflow
        USER([User creates JV]) --> DRAFT[draftJV]
        DRAFT --> PERIOD2{Period open?}
        PERIOD2 -->|No| REJECT_P2[Reject: Period closed]
        PERIOD2 -->|Yes| JV_DRAFT[JV Status: Draft]
        
        JV_DRAFT --> APPROVE[approveJV]
        APPROVE --> ROLE{Approver in JV_APPROVER_ROLES?}
        ROLE -->|No| REJECT_ROLE[Reject: Unauthorized]
        ROLE -->|Yes| FOUR_EYES{4-Eyes: approver != maker?}
        FOUR_EYES -->|No| REJECT_4E[Reject: Same person]
        FOUR_EYES -->|Yes| BAL_CHECK2{FIN-3: Balanced?}
        BAL_CHECK2 -->|No| REJECT_BAL2[Reject: Imbalance]
        BAL_CHECK2 -->|Yes| JV_POSTED[Status: Posted]
    end

    POSTED_AUTO --> LEDGER[(Ledger)]
    JV_POSTED --> LEDGER

    LEDGER --> REPORTS[Budget vs Actual / Cash Flow / Trial Balance]

    style REJECT_PERIOD fill:#ef4444,color:white
    style REJECT_BAL fill:#ef4444,color:white
    style REJECT_P2 fill:#ef4444,color:white
    style REJECT_ROLE fill:#ef4444,color:white
    style REJECT_4E fill:#ef4444,color:white
    style REJECT_BAL2 fill:#ef4444,color:white
```

**Files:** financeService.ts, budgetService.ts, cashFlowService.ts, periodService.ts
**Tables:** ledger, accounts, cost_centers, fiscal_periods, budget_lines, gl_posting_rules, petty_cash, recurring_expenses, asset_registry
