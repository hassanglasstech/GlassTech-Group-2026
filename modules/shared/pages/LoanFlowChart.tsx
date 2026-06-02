import { useState } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// GlassTech ERP — SAP-Style Loan Requisition Process Flow Chart
// Complete E2E: Requisition → Approval → Loan → PV → Payroll → GL → Completion
// ══════════════════════════════════════════════════════════════════════════════

const PHASES = [
  {
    id: "P1", phase: "Phase 1", title: "Requisition Creation",
    module: "SCM", moduleColor: "#27AE60", icon: "REQ",
    transaction: "ME51N", // SAP equivalent
    trigger: "Employee / HR submits loan request",
    table: "requisitions",
    fields: [
      { name: "id", value: "REQ-GLS-MMYY-XXXX", desc: "Auto-generated" },
      { name: "category", value: "HR", desc: "Fixed for loans" },
      { name: "subCategory", value: "Loan Request | Salary Advance", desc: "Loan type" },
      { name: "status", value: "Pending", desc: "Initial status", badge: "#F39C12" },
      { name: "employeeId", value: "EMP-XXX", desc: "Target employee" },
      { name: "loanAmount", value: "PKR 50,000", desc: "Principal amount" },
      { name: "installments", value: "10 months", desc: "Repayment period" },
      { name: "paymentMode", value: "Cash", desc: "Disbursement method" },
    ],
    gl: null,
    statusBefore: null,
    statusAfter: { table: "requisitions", field: "status", from: "—", to: "Pending", color: "#F39C12" },
  },
  {
    id: "P2", phase: "Phase 2", title: "MD / Manager Approval",
    module: "SCM", moduleColor: "#27AE60", icon: "REL",
    transaction: "ME54N", // SAP Release
    trigger: "MD reviews & clicks Approve in Release Strategy tab",
    table: "requisitions + ledger",
    fields: [
      { name: "approvedBy", value: "MD / Pervez Akhtar", desc: "Approver identity" },
      { name: "approvalLevel", value: "L1 (<100k) | L2 (100k-500k)", desc: "Auto from amount" },
      { name: "paymentStatus", value: "Pending", desc: "For Finance queue" },
    ],
    gl: {
      docType: "PV", status: "Parked",
      id: "GT-PV-GLS-MMYY-XXXX",
      entries: [
        { side: "Dr", code: "11421", name: "Employee Advances", amount: "50,000" },
        { side: "Cr", code: "11112", name: "Cash in Hand — Main", amount: "50,000" },
      ],
      note: "Parked PV auto-created — GL NOT yet effective"
    },
    statusBefore: { table: "requisitions", field: "status", value: "Pending", color: "#F39C12" },
    statusAfter: { table: "requisitions", field: "status", from: "Pending", to: "Approved", color: "#2980B9" },
  },
  {
    id: "P3", phase: "Phase 3", title: "HR Issues Loan",
    module: "HR", moduleColor: "#E67E22", icon: "LOAN",
    transaction: "PA30", // SAP HR Master Data
    trigger: "HR opens Loan Management → links approved REQ → Posts",
    table: "loans + requisitions + ledger",
    fields: [
      { name: "id", value: "timestamp (e.g., 1711234567890)", desc: "Loan record ID" },
      { name: "type", value: "Loan | Advance", desc: "Loan or one-time advance" },
      { name: "amount", value: "PKR 50,000", desc: "Principal" },
      { name: "repaymentAmount", value: "PKR 5,000/month", desc: "Monthly deduction" },
      { name: "status", value: "Active", desc: "Begins repayment cycle", badge: "#27AE60" },
      { name: "requisitionId", value: "REQ-GLS-...", desc: "FK link to approval" },
    ],
    gl: {
      docType: "JV", status: "Posted",
      id: "LOAN-DISB-{timestamp}",
      entries: [
        { side: "Dr", code: "1121", name: "Staff Loans & Advances", amount: "50,000" },
        { side: "Cr", code: "1111", name: "Cash in Hand", amount: "50,000" },
      ],
      note: "Posted immediately — cash leaves company, asset (receivable) created"
    },
    statusBefore: { table: "requisitions", field: "status", value: "Approved", color: "#2980B9" },
    statusAfter: { table: "requisitions + loans", field: "status", from: "Approved / —", to: "Completed / Active", color: "#27AE60" },
  },
  {
    id: "P4", phase: "Phase 4", title: "Finance Posts PV",
    module: "FICO", moduleColor: "#1A3A5C", icon: "FBV0",
    transaction: "FBV0", // SAP Post Parked Document
    trigger: "Finance reviews Parked PV → clicks Post",
    table: "ledger + requisitions",
    fields: [
      { name: "pvId", value: "GT-PV-GLS-MMYY-XXXX", desc: "Same PV from Phase 2" },
      { name: "status", value: "Parked → Posted", desc: "GL now effective" },
      { name: "paymentStatus", value: "Paid", desc: "Requisition cleared" },
      { name: "paymentRef", value: "PV ID", desc: "Cross-reference" },
    ],
    gl: {
      docType: "PV", status: "Posted",
      id: "GT-PV-GLS-MMYY-XXXX",
      entries: [
        { side: "Dr", code: "11421", name: "Employee Advances", amount: "50,000" },
        { side: "Cr", code: "11112", name: "Cash in Hand — Main", amount: "50,000" },
      ],
      note: "Same PV — status flips Parked → Posted. GL becomes live in Trial Balance."
    },
    statusBefore: { table: "ledger", field: "PV status", value: "Parked", color: "#F39C12" },
    statusAfter: { table: "ledger + requisitions", field: "PV / paymentStatus", from: "Parked / Pending", to: "Posted / Paid", color: "#27AE60" },
  },
  {
    id: "P5", phase: "Phase 5", title: "Monthly Payroll — Deduction",
    module: "HR", moduleColor: "#E67E22", icon: "PC00",
    transaction: "PC00", // SAP Payroll Run
    trigger: "HR runs payroll engine for the month",
    table: "payroll",
    fields: [
      { name: "id", value: "PAY-{empId}-{YYYY-MM}", desc: "Payroll record" },
      { name: "loanDeduction", value: "PKR 5,000", desc: "Monthly installment" },
      { name: "50% Cap", value: "max(0, salaryBeforeLoan x 0.5)", desc: "Hard cap guard" },
      { name: "skipMonth", value: "YYYY-MM (optional)", desc: "Skip deduction this month" },
      { name: "loanWaived", value: "false (needs manager+ role)", desc: "HR-3 security" },
      { name: "netSalary", value: "gross + OT - absent - late - loan - EOBI", desc: "Final net" },
    ],
    gl: null,
    statusBefore: null,
    statusAfter: { table: "payroll", field: "record", from: "—", to: "Generated", color: "#2980B9" },
    formula: {
      title: "Loan Deduction Formula",
      lines: [
        "salaryBeforeLoan = gross - absentDed - lateDed - eobiDed",
        "maxLoanCap = salaryBeforeLoan x 0.5",
        "if (loanDed + advanceDed > maxLoanCap):",
        "  loanDed = min(loanDed, maxLoanCap)",
        "  advanceDed = min(advanceDed, maxLoanCap - loanDed)",
      ]
    }
  },
  {
    id: "P6", phase: "Phase 6", title: "Payroll Approval → GL Journal",
    module: "FICO", moduleColor: "#1A3A5C", icon: "FB50",
    transaction: "FB50", // SAP GL Posting
    trigger: "HR approves → Edge Function validates → auto-posts PAY-JV",
    table: "payroll + ledger + loans",
    fields: [
      { name: "approvedBy", value: "JWT-verified (HR-1)", desc: "Server-side identity" },
      { name: "roles", value: "manager | finance_manager | super_admin", desc: "Allowed" },
      { name: "double_approval", value: "Checked via audit_log", desc: "No duplicate" },
    ],
    gl: {
      docType: "JV", status: "Posted",
      id: "PAY-JV-{MMYY}",
      entries: [
        { side: "Dr", code: "5211", name: "Salaries & Wages", amount: "basic (by dept)" },
        { side: "Dr", code: "5212", name: "Allowances", amount: "allowances (by dept)" },
        { side: "Dr", code: "5213", name: "Overtime Pay", amount: "OT (by dept)" },
        { side: "Cr", code: "2211", name: "Salaries Payable", amount: "totalNetDisbursable" },
        { side: "Cr", code: "1121", name: "Staff Loans & Advances", amount: "totalLoanRecovery" },
      ],
      note: "Cr 1121 reverses the loan asset — reducing outstanding receivable each month"
    },
    statusBefore: { table: "payroll", field: "status", value: "Generated", color: "#2980B9" },
    statusAfter: { table: "payroll + loans", field: "status", from: "Generated / Active", to: "Approved / Active|Completed", color: "#27AE60" },
  },
  {
    id: "P7", phase: "Phase 7", title: "Salary Disbursement",
    module: "FICO", moduleColor: "#1A3A5C", icon: "F110",
    transaction: "F110", // SAP Payment Run
    trigger: "HR clicks 'Mark Salary Paid' on each employee",
    table: "payroll + ledger",
    fields: [
      { name: "isSalaryPaid", value: "true", desc: "Salary disbursement flag" },
      { name: "isOvertimePaid", value: "true", desc: "OT disbursement flag" },
    ],
    gl: {
      docType: "JV", status: "Posted",
      id: "PAY-DISB-{payId}-salary-{ts}",
      entries: [
        { side: "Dr", code: "2211", name: "Salaries Payable", amount: "netSalary" },
        { side: "Cr", code: "1111", name: "Cash in Hand", amount: "netSalary" },
      ],
      note: "Clears the Salaries Payable liability — cash leaves to employee"
    },
    statusBefore: { table: "payroll", field: "isSalaryPaid", value: "false", color: "#F39C12" },
    statusAfter: { table: "payroll", field: "isSalaryPaid", from: "false", to: "true", color: "#27AE60" },
  },
  {
    id: "P8", phase: "Phase 8", title: "Loan Completion",
    module: "HR", moduleColor: "#E67E22", icon: "DONE",
    transaction: "PA30", // SAP HR
    trigger: "Automatic — when cumulative repayment >= original amount",
    table: "loans",
    fields: [
      { name: "status", value: "Active → Completed", desc: "Auto on full repayment", badge: "#27AE60" },
      { name: "repaid", value: ">= original amount", desc: "Trigger condition" },
    ],
    gl: null,
    statusBefore: { table: "loans", field: "status", value: "Active", color: "#2980B9" },
    statusAfter: { table: "loans", field: "status", from: "Active", to: "Completed", color: "#27AE60" },
    note: "No additional GL — monthly PAY-JV credits already reversed 1121 balance over time"
  },
];

// ── Colors ───────────────────────────────────────────────────────────
const MODULE_COLORS = {
  SCM:  { bg: "#27AE6018", border: "#27AE60", text: "#27AE60", label: "SCM / Procurement" },
  HR:   { bg: "#E67E2218", border: "#E67E22", text: "#E67E22", label: "HCM / Payroll" },
  FICO: { bg: "#1A3A5C18", border: "#1A3A5C", text: "#5DADE2", label: "FICO / Finance" },
};

function GLBox({ gl }) {
  if (!gl) return null;
  return (
    <div style={{
      marginTop: 10, padding: "10px 12px", borderRadius: 8,
      background: "#0A1628", border: "1px solid #2C3E5088"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#5DADE2", letterSpacing: 1 }}>
          GL POSTING
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{
            fontSize: 8, padding: "2px 6px", borderRadius: 8,
            background: gl.status === "Posted" ? "#27AE6033" : "#F39C1233",
            color: gl.status === "Posted" ? "#27AE60" : "#F39C12",
            fontWeight: 700
          }}>{gl.status}</span>
          <span style={{
            fontSize: 8, padding: "2px 6px", borderRadius: 8,
            background: "#2980B933", color: "#2980B9", fontWeight: 700
          }}>{gl.docType}</span>
        </div>
      </div>
      <div style={{ fontSize: 8, color: "#667788", marginBottom: 6 }}>
        ID: {gl.id}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ fontSize: 8, color: "#667788", textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #2C3E50" }}>Side</th>
            <th style={{ fontSize: 8, color: "#667788", textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #2C3E50" }}>Code</th>
            <th style={{ fontSize: 8, color: "#667788", textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #2C3E50" }}>Account</th>
            <th style={{ fontSize: 8, color: "#667788", textAlign: "right", padding: "2px 4px", borderBottom: "1px solid #2C3E50" }}>PKR</th>
          </tr>
        </thead>
        <tbody>
          {gl.entries.map((e, i) => (
            <tr key={i}>
              <td style={{
                fontSize: 9, padding: "3px 4px", fontWeight: 700,
                color: e.side === "Dr" ? "#E74C3C" : "#27AE60"
              }}>{e.side}</td>
              <td style={{ fontSize: 9, padding: "3px 4px", color: "#AABBCC", fontFamily: "monospace" }}>{e.code}</td>
              <td style={{ fontSize: 9, padding: "3px 4px", color: "#E0E0E0" }}>{e.name}</td>
              <td style={{ fontSize: 9, padding: "3px 4px", color: "#E0E0E0", textAlign: "right", fontFamily: "monospace" }}>{e.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {gl.note && (
        <div style={{ fontSize: 8, color: "#F39C12", marginTop: 6, fontStyle: "italic", lineHeight: 1.4 }}>
          {gl.note}
        </div>
      )}
    </div>
  );
}

function StatusTransition({ before, after }) {
  if (!after) return null;
  return (
    <div style={{
      marginTop: 8, padding: "6px 10px", borderRadius: 6,
      background: "#0D1B2A", border: "1px solid #2C3E50",
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"
    }}>
      <span style={{ fontSize: 8, color: "#667788", fontWeight: 700 }}>STATUS:</span>
      <span style={{ fontSize: 8, color: "#667788" }}>{after.table}.{after.field}</span>
      {before && (
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 10,
          background: before.color + "22", color: before.color, fontWeight: 700
        }}>{before.value}</span>
      )}
      <span style={{ fontSize: 10, color: "#667788" }}>{"-->"}</span>
      <span style={{
        fontSize: 9, padding: "2px 8px", borderRadius: 10,
        background: after.color + "22", color: after.color, fontWeight: 700
      }}>{after.to}</span>
    </div>
  );
}

function PhaseConnector({ fromModule, toModule }) {
  const fromColor = MODULE_COLORS[fromModule]?.border || "#2C3E50";
  const toColor = MODULE_COLORS[toModule]?.border || "#2C3E50";
  const isCrossModule = fromModule !== toModule;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "4px 0", position: "relative"
    }}>
      <div style={{
        width: 3, height: isCrossModule ? 40 : 24,
        background: `linear-gradient(to bottom, ${fromColor}, ${toColor})`,
        borderRadius: 2
      }} />
      <div style={{
        width: 0, height: 0,
        borderLeft: "6px solid transparent",
        borderRight: "6px solid transparent",
        borderTop: `8px solid ${toColor}`
      }} />
      {isCrossModule && (
        <div style={{
          position: "absolute", right: -60, top: "50%", transform: "translateY(-50%)",
          fontSize: 7, color: "#F39C12", fontWeight: 700, letterSpacing: 1,
          background: "#F39C1218", padding: "2px 6px", borderRadius: 6
        }}>HANDOFF</div>
      )}
    </div>
  );
}

export default function LoanFlowChart() {
  const [expanded, setExpanded] = useState({});
  const [activePhase, setActivePhase] = useState(null);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    setActivePhase(id);
  };

  return (
    <div style={{
      fontFamily: "'Segoe UI', Calibri, sans-serif",
      background: "#0D1B2A", minHeight: "100vh", color: "#E0E0E0"
    }}>
      {/* Header */}
      <div style={{
        background: "#1B2B3A", padding: "16px 24px",
        borderBottom: "2px solid #2C3E50"
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
          GlassTech ERP — Loan Requisition Process Flow
        </div>
        <div style={{ fontSize: 10, color: "#667788", marginTop: 4 }}>
          SAP-Style E2E Chart | 8 Phases | 3 Modules (SCM, HCM, FICO) | 6 GL Postings | Complete Status Lifecycle
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          {Object.entries(MODULE_COLORS).map(([key, val]) => (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 8,
              background: val.bg, border: `1px solid ${val.border}44`
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: val.border }} />
              <span style={{ fontSize: 10, color: val.text, fontWeight: 700 }}>{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* T-Account Summary Bar */}
      <div style={{
        background: "#1B2B3A", padding: "10px 24px",
        borderBottom: "1px solid #2C3E50",
        display: "flex", gap: 16, flexWrap: "wrap"
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#667788", letterSpacing: 1, alignSelf: "center" }}>
          GL ACCOUNTS INVOLVED:
        </div>
        {[
          { code: "1111", name: "Cash in Hand", type: "Asset" },
          { code: "1121", name: "Staff Loans", type: "Asset" },
          { code: "11421", name: "Employee Advances", type: "Asset" },
          { code: "2211", name: "Salaries Payable", type: "Liability" },
          { code: "5211", name: "Salaries Expense", type: "Expense" },
          { code: "5212", name: "Allowances", type: "Expense" },
          { code: "5213", name: "OT Pay", type: "Expense" },
        ].map(acc => (
          <div key={acc.code} style={{
            padding: "3px 8px", borderRadius: 6,
            background: "#0D1B2A", border: "1px solid #2C3E5088",
            display: "flex", gap: 4, alignItems: "center"
          }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#5DADE2", fontWeight: 700 }}>{acc.code}</span>
            <span style={{ fontSize: 8, color: "#AABBCC" }}>{acc.name}</span>
            <span style={{
              fontSize: 7, padding: "1px 4px", borderRadius: 4,
              background: acc.type === "Asset" ? "#2980B922" : acc.type === "Liability" ? "#E74C3C22" : "#F39C1222",
              color: acc.type === "Asset" ? "#2980B9" : acc.type === "Liability" ? "#E74C3C" : "#F39C12"
            }}>{acc.type}</span>
          </div>
        ))}
      </div>

      {/* Flow Chart */}
      <div style={{ padding: "24px", maxWidth: 800, margin: "0 auto" }}>
        {PHASES.map((phase, idx) => {
          const mc = MODULE_COLORS[phase.module];
          const isExpanded = expanded[phase.id];
          const isActive = activePhase === phase.id;

          return (
            <div key={phase.id}>
              {/* Phase Card */}
              <div
                onClick={() => toggleExpand(phase.id)}
                style={{
                  border: `2px solid ${isActive ? mc.border : mc.border + "44"}`,
                  borderRadius: 14,
                  background: isActive ? mc.bg : "#1B2B3A",
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: isActive ? `0 0 0 3px ${mc.border}22` : "0 2px 8px #0002"
                }}
              >
                {/* Phase Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      {/* SAP Transaction Badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: mc.border + "22", border: `1.5px solid ${mc.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, color: mc.text, fontFamily: "monospace"
                      }}>{phase.icon}</div>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: mc.text, letterSpacing: 1 }}>
                          {phase.phase} | {mc.label} | T-Code: {phase.transaction}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#E0E0E0" }}>
                          {phase.title}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "#AABBCC", marginTop: 2 }}>
                      {phase.trigger}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div style={{
                      fontSize: 8, padding: "3px 8px", borderRadius: 8,
                      background: "#0D1B2A", color: "#667788", fontFamily: "monospace"
                    }}>
                      {phase.table}
                    </div>
                    {phase.gl && (
                      <div style={{
                        fontSize: 8, padding: "3px 8px", borderRadius: 8,
                        background: phase.gl.status === "Posted" ? "#27AE6022" : "#F39C1222",
                        color: phase.gl.status === "Posted" ? "#27AE60" : "#F39C12",
                        fontWeight: 700
                      }}>
                        GL: {phase.gl.docType} ({phase.gl.status})
                      </div>
                    )}
                    <div style={{
                      fontSize: 16, color: "#667788", transform: isExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s"
                    }}>V</div>
                  </div>
                </div>

                {/* Status Transition (always visible) */}
                <StatusTransition before={phase.statusBefore} after={phase.statusAfter} />

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: "1px solid #2C3E5044", paddingTop: 12 }}>
                    {/* Fields */}
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#667788", marginBottom: 6, letterSpacing: 1 }}>
                      DATA FIELDS
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                      {phase.fields.map((f, i) => (
                        <div key={i} style={{
                          padding: "6px 8px", borderRadius: 6,
                          background: "#0D1B2A", border: "1px solid #2C3E5044"
                        }}>
                          <div style={{ fontSize: 8, color: "#667788" }}>{f.name}</div>
                          <div style={{ fontSize: 10, color: "#E0E0E0", fontWeight: 600, fontFamily: "monospace" }}>
                            {f.value}
                          </div>
                          <div style={{ fontSize: 8, color: "#8899AA" }}>{f.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* GL Posting */}
                    <GLBox gl={phase.gl} />

                    {/* Formula (for Phase 5) */}
                    {phase.formula && (
                      <div style={{
                        marginTop: 10, padding: "10px 12px", borderRadius: 8,
                        background: "#E67E2210", border: "1px solid #E67E2233"
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#E67E22", marginBottom: 6 }}>
                          {phase.formula.title}
                        </div>
                        {phase.formula.lines.map((line, i) => (
                          <div key={i} style={{
                            fontSize: 10, color: "#FFCC80", fontFamily: "monospace",
                            paddingLeft: line.startsWith("  ") ? 16 : 0, lineHeight: 1.6
                          }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Phase-specific note */}
                    {phase.note && (
                      <div style={{
                        marginTop: 8, fontSize: 9, color: "#667788", fontStyle: "italic"
                      }}>{phase.note}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Connector Arrow */}
              {idx < PHASES.length - 1 && (
                <PhaseConnector
                  fromModule={phase.module}
                  toModule={PHASES[idx + 1].module}
                />
              )}
            </div>
          );
        })}

        {/* End marker */}
        <div style={{
          textAlign: "center", marginTop: 16, padding: "12px",
          borderRadius: 10, background: "#27AE6018", border: "2px solid #27AE6044"
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#27AE60" }}>
            LOAN LIFECYCLE COMPLETE
          </div>
          <div style={{ fontSize: 9, color: "#667788", marginTop: 4 }}>
            1121 (Staff Loans) balance = 0 | All monthly PAY-JV credits have reversed the asset
          </div>
        </div>

        {/* Status Lifecycle Summary */}
        <div style={{
          marginTop: 24, padding: "16px 20px", borderRadius: 12,
          background: "#1B2B3A", border: "1px solid #2C3E50"
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#E0E0E0", marginBottom: 12 }}>
            Complete Status Lifecycle
          </div>
          {[
            { label: "Requisition", flow: ["Pending", "Approved", "Completed"], colors: ["#F39C12", "#2980B9", "#27AE60"] },
            { label: "Payment Voucher", flow: ["Parked", "Posted"], colors: ["#F39C12", "#27AE60"] },
            { label: "Loan", flow: ["Active", "Completed"], colors: ["#2980B9", "#27AE60"] },
            { label: "Payroll", flow: ["Generated", "Approved", "Salary Paid"], colors: ["#2980B9", "#27AE60", "#27AE60"] },
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: 10, color: "#AABBCC", fontWeight: 600 }}>{row.label}:</div>
              {row.flow.map((status, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    fontSize: 9, padding: "3px 10px", borderRadius: 12,
                    background: row.colors[j] + "22", color: row.colors[j],
                    fontWeight: 700, border: `1px solid ${row.colors[j]}44`
                  }}>{status}</span>
                  {j < row.flow.length - 1 && (
                    <span style={{ fontSize: 10, color: "#667788" }}>{"-->"}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
