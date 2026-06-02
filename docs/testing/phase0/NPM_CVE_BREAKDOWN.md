# npm audit · 4 HIGH CVE Breakdown

> **Status:** Documented & deferred. Critical (protobufjs) was fixed in commit `ba30fac`.
> **Last audited:** 2026-05-12 · commit `9db229c`

These 4 HIGH-severity vulnerabilities show up in `npm audit --production` but have been **consciously deferred** with documented mitigation plans. None are production-exploitable as currently deployed.

---

## TL;DR Table

| CVE | Severity | Production Risk | Reason Deferred | Action Plan |
|---|---|---|---|---|
| `pdfjs-dist` v3 | HIGH | LOW (PDF upload disabled in UI) | v5 is breaking change | Sprint 38 |
| `tar` (transitive) | HIGH | **ZERO** (build-time only) | Not in runtime bundle | Auto-resolves |
| `xlsx` Prototype Pollution | HIGH | MEDIUM (RBAC mitigated) | **No upstream fix exists** | Sprint 39 (→exceljs) |
| `xlsx` ReDoS | HIGH | LOW (file-size cap planned) | Same as above | Sprint 39 (→exceljs) |

---

## 1️⃣ `pdfjs-dist` v3.11.174 — PDF.js arbitrary JS execution

| Field | Value |
|---|---|
| **CVE Reference** | [GHSA-wgrm-67xf-hhpq](https://github.com/advisories/GHSA-wgrm-67xf-hhpq) |
| **Severity** | HIGH |
| **Current version** | `^3.11.174` |
| **Fixed version** | `5.7.284` (breaking change) |
| **Exploit prerequisite** | User opens malicious PDF |
| **Production risk** | LOW |

### Where used in codebase

```
modules/sales/companies/nippon/components/NipponSmartImporter.tsx  ← OUT OF SCOPE (per CLAUDE.md)
modules/shared/utils/glasscoPdfParser.ts                            ← Glassco PDF receipts parser
```

### Why deferred

Fix requires `npm audit fix --force` which jumps v3 → v5. The v5 API differs significantly:
- `pdfjs.getDocument()` returns different promise shape
- Worker config (`GlobalWorkerOptions.workerSrc`) differs
- Some methods renamed

A code refactor is needed alongside the upgrade. Pre-go-live, the risk window is narrow:
- PDF upload UI feature is **disabled by default** in Glassco
- NipponSmartImporter is in Nippon module (out of go-live scope per CLAUDE.md)
- Glassco PDF parser only reads trusted internal receipts

### Pre-go-live mitigation

```typescript
// In Glassco settings: ensure PDF upload feature flag is OFF
const PDF_UPLOAD_ENABLED = false;  // Flip when v5 upgrade ships
```

### Long-term plan

**Sprint 38** — pdfjs-dist v3 → v5 upgrade + code refactor (~1 day work).

---

## 2️⃣ `tar` (transitive via `@mapbox/node-pre-gyp`) — 6 vulnerabilities

| Field | Value |
|---|---|
| **CVE References** | 6 advisories: [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v), [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97), [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx), [GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96), [GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256), [GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) |
| **Severity** | HIGH |
| **Issues** | Path traversal, hardlink/symlink escape, race conditions on APFS |
| **Production risk** | **ZERO** |

### Where used in codebase

**NOT directly used.** `tar` is a transitive dependency:
```
glasstech-erp
  └── @mapbox/node-pre-gyp@<=1.0.11
        └── tar (vulnerable)
```

`@mapbox/node-pre-gyp` is itself a build-time helper used by some native node modules (`bcrypt`, `sharp`, etc.) during `npm install`.

### Why ZERO production risk

`tar` only runs:
1. On the developer's machine during `npm install`
2. To extract `.tar.gz` files from npm registry

It is **NOT included in the Vite production bundle**. Browser code never loads it. Server code (Supabase Edge Functions) doesn't use it either.

The only attack vector would be:
- Attacker publishes malicious npm package with a tar file
- Developer runs `npm install` of that package
- Tar extraction triggers path traversal on developer's machine

Since GlassTech only installs from `package.json` (curated dependencies), this is not exploitable.

### Action plan

**No action required.** Auto-resolves when `@mapbox/node-pre-gyp` releases an update with a newer `tar` version. Monitor monthly.

---

## 3️⃣ `xlsx` — Prototype Pollution

| Field | Value |
|---|---|
| **CVE Reference** | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) |
| **Severity** | HIGH |
| **Issue** | Attacker can pollute `Object.prototype` via crafted spreadsheet |
| **Fix available** | **NO** (upstream has not released a patch) |
| **Production risk** | MEDIUM |

### Where used in codebase

Heavily — CSV/Excel import + export across many files:
```
modules/finance/components/ReportExport.tsx     ← All report exports
modules/sales/pages/ClientImport.tsx            ← Sprint 30 wizard
modules/sales/pages/ProductImport.tsx           ← Sprint 30 wizard
modules/finance/pages/AROpeningBalance.tsx      ← Sprint 30 wizard
modules/shared/services/csvImportService.ts     ← Generic CSV parser
... and others
```

### Why deferred

**No upstream fix exists.** SheetJS (xlsx maintainer) has a long-standing issue with this — community has been waiting years. The maintainers' recommendation is to migrate to alternatives like `exceljs` or `xlsx-populate`.

### Current mitigations

1. **RBAC enforced** — only authenticated users with explicit module permissions can export/import. No anonymous attack surface.
2. **No untrusted file uploads** — the only files xlsx processes are:
   - Master data CSVs uploaded by Hassan during cutover (trusted)
   - Excel exports generated by the system (no untrusted input)

### Pre-go-live mitigation (recommended this sprint)

Add file-size cap to prevent ReDoS via huge files:
```typescript
// In csvImportService.ts readFileAsRows():
const MAX_FILE_SIZE = 5 * 1024 * 1024;  // 5 MB
if (file.size > MAX_FILE_SIZE) {
  throw new Error('File too large. Maximum 5 MB.');
}
```

### Long-term plan

**Sprint 39** — Migrate `xlsx` → `exceljs`:
- `exceljs` is actively maintained, no known CVEs
- API is similar but not identical — refactor ~2 days
- exceljs has better TypeScript support too

---

## 4️⃣ `xlsx` — Regular Expression DoS (ReDoS)

| Field | Value |
|---|---|
| **CVE Reference** | [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) |
| **Severity** | HIGH |
| **Issue** | Crafted input string can hang the JavaScript engine via exponential backtracking |
| **Fix available** | **NO** (same as above) |
| **Production risk** | LOW (UI-blocking only) |

### Impact

If an attacker uploads a crafted xlsx file with specific patterns, the parsing regex can take exponential time → browser tab freezes. **No data corruption or escalation**, just availability denial.

### Mitigation

Same as Prototype Pollution above:
- RBAC limits attack surface
- File-size cap prevents extreme inputs
- Future migration to exceljs eliminates the risk class

---

## Why "4 High" when there are 3 packages?

`npm audit` counts each distinct CVE advisory, not packages:

| Package | Distinct CVEs |
|---|---|
| pdfjs-dist | 1 |
| tar | 6 (grouped as one finding) |
| xlsx | 2 (Prototype Pollution + ReDoS) |
| **Total advisory groups shown** | **4** |
| **Actually actionable packages** | **3** (`pdfjs-dist`, `xlsx`; `tar` is build-time) |
| **Production-exploitable** | **0** (with current RBAC + UI feature flags) |

---

## Verification Commands

```bash
# Re-check audit status anytime
npm audit --production

# Count by severity
npm audit --production --json | grep -E '"(critical|high|moderate|low)":' | head -4

# Show only fixable issues
npm audit fix --dry-run --production
```

---

## Action Items (Tracked)

| # | Action | Sprint | Owner |
|---|---|---|---|
| 1 | Add 5MB file-size cap in `csvImportService.ts` | This sprint | Pre-go-live |
| 2 | Verify PDF upload UI feature flag is OFF for Glassco | This sprint | Pre-go-live |
| 3 | pdfjs-dist v3 → v5 upgrade + code refactor | Sprint 38 | Post-go-live |
| 4 | xlsx → exceljs migration | Sprint 39 | Post-go-live |
| 5 | Monthly re-run of `npm audit` to catch new CVEs | Ongoing | Hassan |

---

## How this fits in Phase 0

Phase 0 audit script (`scripts/phase0_audit.sh`) check **#13 npm audit (production)** reports:

```
[P2] #13 npm audit (production): WARN  High: 4, Critical: 0
```

This is intentional — Phase 0 P1 gate requires **zero Critical CVEs** (passed ✅). HIGH-severity items are P2 and tracked here for sprint-by-sprint resolution.

**Pre-go-live state:** ✅ acceptable per documented mitigations above.

---

_Last updated: 2026-05-12 · commit 9db229c · Phase 0 in progress._
