# GlassTech S/4HANA ERP -- LLM-Optimized Enterprise Knowledge Base

> Master Index for Gemma 4 Copilot Ingestion
> Generated: April 2026
> System: GlassTech Factory 2026 ERP (Multi-Company Glass Manufacturing)

---

## System Overview

GlassTech S/4HANA is a multi-company ERP system for glass manufacturing and aluminum fabrication. It serves 5 companies (GTK, GTI, Glassco, Nippon, Factory) with integrated modules spanning the full business lifecycle from quotation to delivery, with real-time financial controls, production tracking, and AI-assisted decision making.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (Cloud DB + Auth + Storage + Edge Functions) + Zustand (State) + Tailwind CSS

**Architecture:** Offline-first (localStorage cache with async Supabase sync), multi-tenant via company field isolation (app-layer + RLS), role-based access control

---

## Module Index

| # | Module | File | SAP Equivalent | Primary Users |
|---|--------|------|---------------|---------------|
| 01 | [FICO Financials](01_finance.md) | 01_finance.md | FI/CO | Finance team, Accountants, CFO |
| 02 | [Human Capital Management](02_hr.md) | 02_hr.md | HCM/PA/PY | HR team, Supervisors, Employees |
| 03 | [Sales & Distribution](03_sales.md) | 03_sales.md | SD | Sales team, Account managers |
| 04 | [Procurement & Material Mgmt](04_procurement.md) | 04_procurement.md | MM/PUR | Store incharge, Procurement team |
| 05 | [Production & Manufacturing](05_production.md) | 05_production.md | PP | Production supervisors, Cutters, QC |
| 06 | [HSE & Factory Operations](06_hse.md) | 06_hse.md | EHS/PM | Factory incharge, HSE officer |
| 07 | [Auth, RBAC & Security](07_auth_rbac.md) | 07_auth_rbac.md | BASIS | Super admin only |

---

## Company Structure

| Company | Code | Business |
|---------|------|----------|
| GTK Group | GTK | Aluminum window & door fabrication |
| GTI Group | GTI | Aluminum fabrication (sister company) |
| Glassco Group | Glassco | Glass cutting, tempering, processing |
| Nippon Group | Nippon | Glass distribution & sales |
| Factory Group | Factory | Shared factory operations & HSE |

---

## Key Business Processes (Cross-Module)

### Order-to-Cash (Sales > Production > Finance)
```
Quotation (Draft) > Approved (pieces generated) > Production (Cut > QC > Temper > Dispatch)
> Delivery > Invoice > Payment Collection > GL Posted
```
Detailed in: [03_sales.md](03_sales.md), [05_production.md](05_production.md), [01_finance.md](01_finance.md)

### Procure-to-Pay (Procurement > Finance)
```
Requisition > PO (budget check) > GRN (QA + 3-way match) > Advance Settlement > GL Posted
```
Detailed in: [04_procurement.md](04_procurement.md), [01_finance.md](01_finance.md)

### Hire-to-Retire (HR > Finance)
```
Onboard (probation) > Confirm > Attendance > Payroll > Salary Disbursement > GL Posted
```
Detailed in: [02_hr.md](02_hr.md), [01_finance.md](01_finance.md)

### Incident-to-Resolution (HSE > Procurement)
```
Incident Reported > Critical Escalation > Corrective Action > Closure (ISO 45001)
Factory Event > Auto-Requisition > PO > GRN > Issue Resolved
```
Detailed in: [06_hse.md](06_hse.md), [04_procurement.md](04_procurement.md)

---

## Critical Business Rules Summary

| Rule ID | Module | Rule | Impact |
|---------|--------|------|--------|
| FIN-1 | Finance | Advance overclaim max 1.5x | Blocks settlement |
| FIN-2 | Finance | No orphan settlements | Blocks posting |
| FIN-3 | Finance | GL balance zero-tolerance (paisa precision) | Blocks any imbalanced entry |
| SAL-1 | Sales | Discount max 99.99%, cannot exceed subtotal | Blocks save |
| SAL-2 | Sales | Invoice amount must be finite and non-negative | Blocks save |
| SAL-3 | Sales | Credit limit enforcement (live AR query) | Blocks approval |
| SAL-4 | Sales | Atomic payment receipt processing | Prevents race conditions |
| SCM-1 | Procurement | QA gate before GRN posting | Blocks GRN |
| SCM-2 | Procurement | Budget check on PO approval | Blocks PO |
| SCM-3 | Procurement | Sufficient stock for material issue | Blocks issue |
| SCM-5 | Procurement | Three-way match (PKR 1 tolerance) | Blocks vendor payment |
| MFG-1 | Production | Order existence validation before pieces | Blocks piece creation |
| MFG-5 | Production | Oven capacity check before dispatch | Blocks dispatch |
| HR-3 | HR | Loan waiver requires manager+ role | Silently reverts |
| HR-4 | HR | CNIC format: 35201-1234567-1 | Blocks save |
| HR-5 | HR | Phone format: 03XX-XXXXXXX | Blocks save |
| HSE-1 | HSE | Incident closure requires completed corrective action | Blocks closure |
| HSE-2 | HSE | Critical incidents auto-escalate (30-min SLA) | WhatsApp alert |
| HSE-3 | HSE | Shift handover acknowledgement mandatory | Blocks event submit |
| SEC-2 | Security | Multi-tenant isolation (app + RLS) | Prevents data leakage |

---

## Keyboard Shortcuts (Global)

| Shortcut | Action | Modules |
|----------|--------|---------|
| Alt+R | Refresh current view | All modules |
| Alt+N | New entry/record | Finance (New JV), Production (New Team) |

---

## Data Persistence Architecture

```
User Action
    |
    v
localStorage (immediate, synchronous)
    |
    v (async, non-blocking)
Supabase Cloud (primary source of truth)
    |
    v (on app start)
warmCache() pulls latest from cloud to local
```

**Offline Mode:** All core operations work offline via localStorage. Cloud sync happens when connectivity resumes.

---

## AI Copilot Integration

The Factory module includes an AI agent system with 25+ tools and 5 specialist agents. The AI can:
- Query production floor status, stock levels, vendor performance
- Create quotations, requisitions, tasks, factory events
- Draft payment vouchers (Finance must manually approve)
- Generate reports and send WhatsApp notifications

All AI actions are audit-logged in the `agent_actions` table.

Detailed in: [06_hse.md](06_hse.md) (AI Agent System section)

---

## Supabase Tables Reference

### Core Tables
| Table | Module | Purpose |
|-------|--------|---------|
| user_profiles | Auth | User accounts, roles, companies |
| employees | HR | Employee master data |
| attendance | HR | Daily attendance records |
| attendance_overrides | HR | Manual payroll adjustments |
| payroll | HR | Monthly payroll records |
| loans | HR | Loan/advance records |
| leave_applications | HR | Leave workflow |
| quotations | Sales | Quotations and sales orders |
| invoices | Sales | Customer invoices |
| payment_receipts | Sales | Payment collection |
| clients | Sales | Business partners |
| vendors | Sales/Procurement | Supplier master |
| purchase_orders | Procurement | Purchase orders |
| grn_records | Procurement | Goods receipts |
| store_items | Procurement | Inventory master |
| stock_ledger | Procurement | Stock movements |
| production_pieces | Production | Individual glass pieces |
| tempering_dispatches | Production | Vendor dispatch trips |
| ncr_events | Production | Breakage reports |
| ledger | Finance | General ledger entries |
| fiscal_periods | Finance | Period management |
| cost_centers | Finance | Cost center master |
| factory_events | HSE | Factory daily events |
| hse_incidents | HSE | Safety incidents |
| agent_actions | AI | Agent tool audit log |

---

## Version & Compliance

- **ERP Version:** 1.0.0-beta
- **Accounting Standard:** IAS-2 (Landed Cost MAP), IFRS 9 (ECL Provisioning)
- **Safety Standard:** ISO 45001 (HSE incident management)
- **Tax:** Pakistan GST framework
- **Currency:** PKR (Pakistani Rupees)
- **Fiscal Year:** Calendar year (Jan-Dec)
- **Working Week:** Monday-Saturday (Sunday off)
