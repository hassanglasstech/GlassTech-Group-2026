# Module: Health, Safety & Environment (HSE) + Factory Operations

> GlassTech S/4HANA ERP -- Factory & HSE Module Knowledge Base
> For LLM Copilot Ingestion (Gemma 4)

---

## User Roles Allowed

| Role | Access Level |
|------|-------------|
| `super_admin`, `owner`, `hassan` | Full factory access |
| `factory_manager` | Full factory-incharge module (primary user) |
| `glassco_admin` | Full factory access for Glassco |
| `glassco_supervisor` | Production views within factory |
| `glassco_production` | Production + Inventory + Logistics |
| Other roles | No factory module access unless explicitly granted |

---

## Core Workflows (Step-by-Step)

### Workflow 1: Factory Event Logging

**Screen:** Factory Incharge Module > Daily Log

1. Click **+ Log Event**
2. Select Sector:
   - **Production:** Table Issue, Cutting Problem, QC Rejection, Breakage, Team Shortage, Order Delay, Machine Stop
   - **Store/Procurement:** Material Needed, Tool Request, Stock Low, GRN Issue, Item Damaged
   - **Maintenance:** Generator Issue, Machine Breakdown, Repair Needed, Preventive Check, Downtime Log
   - **HR/Admin:** Absent Worker, Overtime Request, Incident Report, Leave Request, Discipline Issue
   - **Logistics:** Vehicle Issue, Trip Log, Diesel Request, Dispatch Problem, Driver Issue
   - **Office/Utilities:** WAPDA Issue, Printer Problem, AC Issue, Supply Needed, Visitor Log
3. Enter Event Detail and select Priority: Urgent / Medium / Low
4. **HSE-3 Shift Handover:** Check the acknowledgement box: "Incoming shift supervisor has been verbally briefed on all open issues, active hazards, and pending actions" (MANDATORY)
5. Click **Submit**

**Auto-Requisition Trigger:** If event type is: Material Needed, Tool Request, Stock Low, Diesel Request, or Supply Needed:
- System auto-checks store inventory
- Creates Procurement Requisition automatically with:
  - Company: Factory
  - Priority: Urgent (if event is Urgent) else Normal
  - Header: `[AUTO] {eventType} - {sector}`
  - Linked back to factory event via `source_event_id`
- Requisition appears in Procurement module for MD approval

### Workflow 2: HSE Incident Reporting

**Screen:** Factory Incharge Module > HSE

1. Click **+ Report Incident**
2. Fill in:
   - Date, Time, Location (within factory)
   - Severity: Near Miss, Minor, Major, **Critical**
   - Category: Injury, Fire, Chemical, Equipment, Slip/Fall, Other
   - Description of incident
   - Injured Person name (if applicable)
   - Reported By (auto-filled from login)
3. Enter Corrective Action (required for closure)
4. Set Action Due Date
5. Click **Save**

**Critical Incident Auto-Escalation (HSE-2):**
- If severity = **Critical**: System immediately triggers `hse-escalation` Edge Function
- Edge Function looks up HSE Manager for the company
- Creates escalation record in `hse_escalations` table (30-minute SLA)
- Sends WhatsApp notification to HSE Manager
- Non-blocking: incident is saved even if escalation fails

### Workflow 3: Incident Closure

1. Open incident from HSE dashboard
2. Update Action Status: Pending > In Progress > **Completed**
3. Document corrective action taken
4. Click **Close Incident**
5. **HSE-1 Gate:** System verifies:
   - Corrective action field is filled
   - Action status is "Completed"
   - Both must be true or closure is blocked

### Workflow 4: Escalation Alert Management

**Screen:** Factory Incharge Module > Escalation Alerts

1. View unresolved escalation alerts
2. Each shows: Event ID, Sector, Type, Priority, Hours Overdue
3. Click **Dismiss** to resolve: marks `resolved = true` with timestamp
4. Green badge appears when all escalations cleared

### Workflow 5: Factory Manager Dashboard (Multi-Company)

**Screen:** Factory Manager Dashboard

1. View global KPIs across all companies (GlassCo, GTK, GTI):
   - Active Orders, Pieces on Cutting Floor, Ready for Dispatch, NCR Today
2. Per-Company Status Cards:
   - Active orders, cutting/processing/ready/delivered counts
   - On-track percentage, NCR count, progress bar
3. Active Orders Table: Top 12 orders with status and progress
4. Live Alerts Panel: NCR alerts (urgent), dispatch notifications, backlog warnings

### Workflow 6: Gate Control (Dispatch)

**Screen:** Factory Incharge Module > Gate Control

1. Select pending tempering dispatch from dropdown
2. Enter Vehicle Number and Driver Name
3. Click **Generate & Dispatch**
4. System creates Gate Pass: `GP-FAC-{SEQUENCE}`
   - Movement Code: 601 (SAP standard)
   - Material details auto-filled from dispatch
   - Status: Allowed
5. Dispatch status updated to "Dispatched"
6. All linked production pieces status > Dispatched

---

## Strict Business Rules & Constraints

### HSE-1: Incident Closure Requires Corrective Action (ISO 45001)
- **Rule:** Cannot close incident without:
  1. Corrective action field filled
  2. Action status = "Completed"
- **Rationale:** ISO 45001 compliance, insurance validity
- **Enforcement:** Hard gate -- alert shown, closure blocked

### HSE-2: Critical Incident Auto-Escalation
- **Rule:** Any incident with severity "Critical" auto-triggers escalation
- **SLA:** 30 minutes for HSE Manager response
- **Channel:** WhatsApp notification via Edge Function
- **Non-blocking:** Incident saved regardless of escalation success

### HSE-3: Shift Handover Acknowledgement
- **Rule:** Cannot submit factory event without checking handover acknowledgement
- **Text:** "Incoming shift supervisor has been verbally briefed on all open issues, active hazards, and pending actions"
- **Purpose:** Prevents hazard communication loss at shift boundaries
- **Enforcement:** Hard gate checkbox, form cannot submit without it

### SEC-6: Company Isolation
- All factory data filtered by company from authenticated user's profile
- Default: 'Factory' company
- Prevents cross-tenant data exposure

---

## State Machines

### Factory Event Status
```
Open ----[Assign]----> Pending ----[Work Starts]----> In Progress ----[Complete]----> Resolved ----[Close]----> Closed
```

### HSE Incident Status
```
Open (corrective action documented)
  |
  +--[Action Status: Pending → In Progress → Completed]
  |
  +--[Both action + status = Completed]----> Closed (HSE-1 gate)
```

### HSE Incident Severity Levels
| Severity | Action |
|---------|--------|
| Near Miss | Document only |
| Minor | Document + corrective action |
| Major | Document + corrective action + review |
| Critical | Document + auto-escalation (HSE-2) + 30-min SLA |

### Escalation Alert Status
```
Created (unresolved) ----[Dismiss]----> Resolved (with timestamp)
```

### Gate Pass Status
```
Pending ----[Generate & Dispatch]----> Allowed
                                        |
                                   Denied (manual override)
```

---

## GL Impact

Factory events that trigger auto-requisitions follow the standard Procurement GL flow:
- Requisition approved > Parked PV created > Finance posts > GL entry live
- No direct GL impact from HSE module (incident costs tracked via requisitions/NCR)

---

## Factory Incharge Navigation Structure

### Group 1: Overview
- Home Dashboard
- FM Dashboard (multi-company view)
- Daily Log (event logging)
- Requests (requisition tracker)

### Group 2: Production
- Visual Board (factory layout)
- Order Flow (animated pipeline)
- Floor Planner (team management)
- Vehicle Load Optimizer
- Cutting Sequence Planner
- Worker KPI Dashboard
- HSE Module
- Asset Register

### Group 3: MIS & Reports
- MIS Dashboard
- Job P&L
- True Cost per SqFt
- Vendor Intelligence
- Delivery KPI Dashboard
- Financial Statements (Mobile)

### Group 4: AI & Alerts
- AI Activation Dashboard
- Morning Briefing Module
- AI Chat Interface
- Predictive Alerts
- Agent Watchlist
- Inbox Intelligence
- Gap Detection
- Report Narrative Viewer
- WhatsApp Integration

### Group 5: Management
- Task Manager
- Vendor SLA Master
- Strategic Memory
- Telegram Setup

---

## AI Agent System (Factory Copilot)

### Available AI Agents (5 Specialists)
| Agent | Focus Area |
|-------|-----------|
| Factory Agent | Production capacity, operational risks, floor status |
| Finance Agent | Cash position, margins, receivables, financial risks |
| Vendor Agent | Vendor reliability, supply risks, SLA performance |
| HR Agent | Workforce availability, attendance, employee issues |
| Sales Agent | Order pipeline, revenue, client relationships |

### AI Tool Categories

**READ Tools (Low Risk) -- 17 tools:**
- find_order, search_client, get_glass_rate, petty_cash_report
- outstanding_payments, expense_summary, get_client_balance
- floor_status, ncr_report, cutting_report, stuck_jobs
- stock_status, purchase_order_status, vendor_summary
- delivery_status, requisition_overview, ops_snapshot

**CREATE Tools (Medium Risk) -- 5 tools:**
- create_quotation, create_requisition, update_order_status
- create_task, log_factory_event

**PAYMENT Tool (High Risk) -- 1 tool:**
- draft_payment_voucher (Draft only -- Finance must manually approve)

**OUTPUT Tools (Low Risk) -- 2 tools:**
- print_document, send_whatsapp

### AI Tool Examples

**"Aaj ki cutting report dikhao"** > Uses `cutting_report` tool
**"Kaunse jobs stuck hain 5 din se?"** > Uses `stuck_jobs` with minDays=5
**"Glass ka stock check karo"** > Uses `stock_status` tool
**"Ek requisition banao cement ke liye"** > Uses `create_requisition` tool

### Multi-Agent Orchestration
- All 5 agents run in parallel (concurrent analysis)
- Each agent processes its domain data
- Master synthesis combines all agent outputs into single recommendation
- Uses Claude Sonnet for final synthesis (direct, actionable, English/Urdu mixed)

### Audit Trail
- All AI tool executions logged to `agent_actions` table
- Fields: tool_name, tool_params, status (executed/failed), approved_by, result, error

---

## Daily Summary KPIs

| Metric | Description |
|--------|-------------|
| Total Events | Events logged today |
| Resolved | Events resolved/closed today |
| Open | Events still pending |
| Urgent | High-priority unresolved events |
| By Sector | Breakdown: Production, Store, Maintenance, HR, Logistics, Office |

---

## Event-to-Requisition Auto-Trigger Types

| Event Type | Auto-Creates Requisition? |
|-----------|--------------------------|
| Material Needed | Yes |
| Tool Request | Yes |
| Stock Low | Yes |
| Diesel Request | Yes |
| Supply Needed | Yes |
| All other types | No |
