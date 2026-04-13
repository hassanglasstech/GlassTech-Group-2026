# Decision Intelligence Architecture — GlassTech AgentOS

**Date:** 2026-04-16
**Status:** Implemented (Phase 6)

---

## Three-Layer Memory Model

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: PROCEDURAL (What to do)                    │
│  Hard rules (never override) + Soft rules (learn)    │
│  8 hard rules seeded + 8 soft rules seeded           │
├─────────────────────────────────────────────────────┤
│  Layer 2: SEMANTIC (What it means)                   │
│  Extracted facts from 10+ similar decisions          │
│  "Client X = slow payer but reliable"                │
├─────────────────────────────────────────────────────┤
│  Layer 1: EPISODIC (What happened)                   │
│  Every decision + context + outcome + feedback       │
│  Tracked for 30-60 days post-decision                │
└─────────────────────────────────────────────────────┘
```

## Confidence Scoring Algorithm

```
Initial:
  Hard rules:    1.00 (never changes)
  With history:  0.55 + log10(count+1) × 0.20
  No history:    0.50 (new entity)

Update after outcome:
  confidence_new = confidence_old + (impact × learning_rate)
  Good outcome:   +0.10 × 0.20 = +0.020
  Bad outcome:    -0.15 × 0.20 = -0.030

Decay:
  90 days unused:     × 0.95
  3+ owner overrides: × 0.80

Thresholds:
  ≥ 0.85: Autonomous (owner notified after)
  0.60-0.84: Recommend (owner approves)
  < 0.60: Escalate (owner decides)
```

## Decision Agents

| Agent | Use Cases | Tables Read | Confidence Basis |
|---|---|---|---|
| FinanceDecisionAgent | Credit approval, Vendor payment priority, Bad debt write-off | quotations, invoices, payment_receipts | Payment history + overdue days |
| ProductionDecisionAgent | Rush order, Remnant match, Recut vs scrap | production_pieces, remnants, quotations | Queue depth + client value |
| OpsDecisionAgent | Requisition approval, Vendor selection, Reorder trigger | requisitions, vendors, store_items | Budget + stock coverage days |

## Safeguards (Hard Rules)

| Rule | Agent | Condition | Action | Override Allowed? |
|---|---|---|---|---|
| HR-FIN-001 | Finance | Overdue > 90 days | REJECT credit | Never |
| HR-FIN-002 | Finance | GL outside open period | BLOCK posting | Never |
| HR-FIN-003 | Finance | PV > PKR 50K without PO | ESCALATE | Never |
| HR-FIN-004 | Finance | Write-off < PKR 10K no legal | BLOCK | Never |
| HR-PROD-001 | Production | Dispatch non-QC pieces | BLOCK | Never |
| HR-PROD-002 | Production | Production without approved SO | BLOCK (MFG-1) | Never |
| HR-OPS-001 | Ops | Vendor not in master | REJECT PO | Never |
| HR-OPS-002 | Ops | Stock issue > available | BLOCK (SCM-3) | Never |

---

## Validation Questions — Answers

### 1. Minimum decisions before agent is trustworthy?

| Rule Type | Minimum | Confidence at Minimum |
|---|---|---|
| Hard rules (owner-defined) | 1 | 1.00 |
| Simple patterns (client pays late) | 10 similar decisions | ~0.72 |
| Complex multi-factor (credit risk) | 30+ decisions | ~0.80 |
| Seasonal patterns (Ramadan) | 3 years (3 cycles) | ~0.75 |

**Practical timeline:** Agent gives recommendations from day 1 at 0.50-0.60 confidence. Owner confirms/overrides every decision for first 20 times. After 20 decisions with 75%+ accuracy, enable autonomous mode (0.85+). After 50 decisions, agent becomes genuinely predictive.

### 2. How to prevent overfitting to recent data?

Three mechanisms:
1. **Weighted history:** `computeDecisionConfidence` queries last 50 decisions (not just 5), blending recent and older patterns
2. **Confidence decay:** Rules unused for 90+ days lose 5% confidence per period — forces re-evaluation against current data
3. **Semantic memory invalidation:** When a fact's supporting decisions start showing opposite outcomes, the `invalidated` flag can be set, forcing the agent to re-derive the pattern

**Additional safeguard:** Owner can manually invalidate any semantic fact or deactivate any soft rule via the Supabase dashboard.

### 3. Saad Builders case — credit risk vs operational recovery?

**Recommended approach (implemented in FinanceDecisionAgent.assessCreditApproval):**

The agent evaluates:
- `avg_delay_days = 33.5` → above 30-day threshold, triggers SR-FIN-001 (soft rule)
- `lifetime_revenue = PKR 4.2M` → triggers SR-FIN-003 (15% extra tolerance for high-value clients)
- Below HR-FIN-001 hard limit (90 days)
- Remnant match available → reduces material cost → improves margin

**Decision:** `APPROVE_WITH_CONDITIONS`
- 50% advance (PKR 90,000)
- Use remnant inventory
- Final payment on delivery

**Confidence:** 0.72 (based on 8 similar past decisions, 6 good outcomes). Action level: `recommend` (owner approves).

### 4. How to handle seasonal patterns (Ramadan/year-end)?

- **Minimum data:** 2-3 cycles of the same season before pattern is reliable
- **Implementation:** Semantic facts with `seasonal_pattern` category
  - Example: `"Ramadan: 40% order volume drop in first 2 weeks, 60% surge in last week"`
  - Evidence required: 3+ Ramadan periods showing consistent pattern
- **Practical approach for year 1:** Agent flags "no seasonal data available" with 0.50 confidence. Owner manually provides seasonal guidance as procedural `guideline` rules.
- **Year 2+:** `extractSemanticFacts` auto-detects seasonal patterns from monthly decision outcome data

### 5. Safeguards against rogue patterns causing financial damage?

Five layers of protection:

1. **Hard rules are immutable** — 8 rules seeded at system level with priority 10, cannot be overridden by agent learning
2. **Confidence thresholds** — Agent cannot act autonomously below 0.85 confidence. First 20 decisions always require owner approval.
3. **Override monitoring** — If a rule is overridden 3+ times, confidence drops 20%. If overridden 5+ times, rule flagged for review in DecisionDashboard.
4. **Outcome tracking** — Every decision outcome tracked. If accuracy drops below 50% after 20 decisions, rule auto-deactivated and owner notified.
5. **Financial caps** — Hard rules enforce: no credit > PKR 500K without owner, no write-off without legal notice, no PV > 50K without PO.

**Maximum damage window:** Between decision and outcome tracking (30-60 days). Mitigated by owner confirmation on all non-autonomous decisions.

---

## Learning Loop

```
Step 1: Context → Agent analyzes using Semantic + Procedural memory
Step 2: Decision → Generates recommendation with confidence score
Step 3: Owner → Confirms / Overrides / Amends
Step 4: Outcome → Tracked after 30-60 days (paid/defaulted/success/failure)
Step 5: Confidence Update → Statistical formula adjusts score
Step 6: Semantic Extraction → After 10+ similar decisions, auto-extract facts
```

## Maturity Levels

| Level | Decisions | Avg Confidence | Agent Behavior |
|---|---|---|---|
| New | 0-5 | 0.50-0.60 | Always escalates, provides reasoning |
| Learning | 5-20 | 0.60-0.75 | Recommends, owner approves all |
| Competent | 20-50 | 0.75-0.85 | Recommends, owner approves high-risk only |
| Expert | 50+ | 0.85+ | Autonomous for routine decisions |
