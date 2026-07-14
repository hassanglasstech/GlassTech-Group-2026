# Nippon — Material Management — God-Mode UX Audit

**Date:** 2026-07-15 · **Lens:** *one-window operation + easy access & handling by a
single (non-technical) operator.* Evidence-cited to `file:line`. Brutal, constructive.

**Screen audited:** Material Mgmt → Master → Material Registry (Nippon), plus the
surrounding tab shell (Stock / Master / Movements / GRN / Hardware GRN).
Primary file: `modules/sales/companies/nippon/NipponProductMaster.tsx` (live);
shell: `modules/procurement/pages/InventoryModule.tsx`.

## Rating for the single-user lens: **4.5 / 10**
Feature-rich and genuinely capable (image audit, category cascade, inline stock,
catalogue builder) — but **built like a power-tool, not a one-person cockpit**.
A solo operator faces a fractured tab flow, an overloaded scrolling toolbar that
mixes daily actions with dangerous data-ops, and a 16-column table with tiny fonts
and redundant columns. It *works*, but it makes one person do more thinking than the
task needs.

---

## 🔴 The right-side dead band (the reported gap) — **FIXED this session**
`NipponProductMaster.tsx:750` renders `<table class="w-full min-w-[1200px]">` with 16
content-sized columns; Unit Price/Stock are right-aligned and Action is
`sticky right-0`. When the table stretches to `w-full` but its content is narrower,
the slack collects into an **empty vertical band** before the right cluster — the
"poori vertical line free." Fix: the Description column is now greedy (`w-full`) so it
absorbs the slack and rows fill edge-to-edge. *(The shell also caps content at
`max-w-[1600px] mx-auto` — `App.tsx:797` — fine at 1080p, but worth revisiting for
very wide monitors.)*

## 🟠 One-window flow is fractured (the core issue)
- **The daily loop is split across tabs.** "Receive hardware → see stock → sell" spans
  the **GRN** tab (receive), the **Stock** tab, and **Material Registry** (sell-from).
  For one person this is 3 destinations for one mental task. The Registry *does* show a
  live Stock column + inline "⚠ OB pending · set" (`:820-834`) — good — but receiving
  still lives elsewhere.
- **Two GRN entry points** confuse: a **"GRN"** tab *and* a black **"HARDWARE GRN"**
  button in the same tab row. Which is the real one? (`InventoryModule.tsx` tab bar.)
- **Double-nested tabs:** top tabs (Stock/Master/Movements/GRN/Hardware GRN) → inside
  Master, a second tab row (Material Registry / Bulk Import) (`NipponProductMaster.tsx:609-622`).
  Two tab systems stacked = the operator loses the "where am I" thread.

## 🟠 Toolbar overload — 8 controls, horizontally scrollable, mixed risk
`NipponProductMaster.tsx:640` the action row is `overflow-x-auto no-scrollbar` — on a
narrower window controls **scroll off with no visible scrollbar** → hidden actions.
- **Tools menu mixes daily with dangerous** (`:654-661`): Export Excel / Export by
  Category sit next to **Backup (JSON)**, **Restore (JSON)**, **Import Excel**,
  **Remove Duplicates**, and **Build Stock from Quotations** — data-mutating/dev
  operations a solo operator should not meet in a everyday menu.
- **Three export paths**: green **Export** button (`:733`) + **Export Excel (flat)** +
  **Export by Category** (in Tools) — redundant, decision-fatiguing.
- **No confirm context** on destructive tools (Remove Duplicates / Restore / Build
  Stock) — one wrong click, no undo for a non-technical user.

## 🟡 Table: dense, redundant, tiny
- **Two category columns**: "Group" = `mainCategory` badge (`:785-788`) AND "Category"
  = Hardware/Accessory/Consumable badge (`:817`). Same idea twice.
- **Two code columns**: KinLong Code (`profileCode`) + ERP Model No (`modelNo`) — which
  does the operator quote by?
- **"Status" column shows an AI-import artifact** — "Exact Match / Near-Match"
  (`:803-810`). Meaningless when *selling* hardware day-to-day; pure noise in the grid.
- **Fonts are 8–10px** across the grid (`text-[10px]`, `text-[9px]`, `text-[8px]`) —
  too small for an all-day operator; an ergonomics/accessibility miss.

## 🟡 Single-operator safety (carried from the God-mode data audit)
- **Importers report "Imported ✓" before the cloud confirms** (fire-and-forget) — a
  solo operator gets false success. A **partial-sheet re-import overwrites** existing
  prices/images (by-id REPLACE). Smart importer **duplicates** on every run.
  *(Full detail + `file:line` in `NIPPON_GODMODE_RATING_2026-07-15.md`.)*
- **A second, dead `NipponProductMaster.tsx`** exists under `modules/system/...` — drift risk.

## 🟢 What's genuinely good (keep)
- Inline **Stock** column + **"OB pending · set"** on negative stock — smart, in-context.
- **Image audit** filter (All / has `N` / missing `N`) — exactly the kind of at-a-glance
  data-quality tool a solo operator needs (`:708-726`).
- **Category → sub-group cascade** filter (`:694-706`), search, sortable headers, sticky
  Action column, pagination footer, and a real **Catalogue builder** — solid bones.

---

## Recommended remediation (phased, one-window first)

**Phase 1 — declutter & de-risk (fast, high impact):**
1. ✅ Kill the right dead-band (Description greedy) — *done.*
2. Collapse the toolbar: keep **Add Item · Search · Category · Image-filter · Export ·
   Catalogue** on the bar; move **Backup / Restore / Import / Dedupe / Build-Stock**
   into a clearly-labelled **"Data & Admin"** drawer with confirms. One export path.
3. Trim the grid for daily use: merge the two category columns, drop the AI **Status**
   column (or make it a toggle), bump base font to **11–12px**.
4. Merge the two GRN entry points into one.

**Phase 2 — true one-window handling:**
5. **Bulk select** on the registry (multi delete / export / re-categorise).
6. **Inline quick-add** row (skip the modal for fast single-item entry).
7. A compact **"Receive stock"** action *inside* the registry row (mini-GRN) so
   receive→see→sell happens on one screen.
8. Make importers **await** the cloud + **field-merge** on re-import (no silent
   overwrite) — from the data audit.

**Phase 3 — polish:**
9. Density toggle (comfortable / compact), remembered per user.
10. Delete the dead `system/.../NipponProductMaster.tsx`.

*Bottom line: the module has strong ingredients but is laid out for a power-user, not a
single operator. Phase 1 alone (declutter toolbar + trim grid + the gap fix) moves the
day-to-day feel from ~4.5 to ~7 without touching the data model.*
