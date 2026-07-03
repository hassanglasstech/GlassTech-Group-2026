# Hassan — Action Items
_Last updated: 2026-07-04 · sirf AAP ke karne wale kaam. (Claude ke dev-fixes neeche alag section mein.)_

---

## 🔴 Ab karne wale (priority)

- [ ] **Functional fixes test karo** (aaj ke 13 P1 fixes). Checklist Claude ne chat mein di hai — Priority 1 pehle:
  - [ ] Quotation save → refresh → gayab na ho (Glassco + Nippon)
  - [ ] Company switch (Glassco ↔ Nippon) → dono ka data salamat
  - [ ] Multi-qty (qty>1) Glassco delivery → COGS 5 guna zyada na ho
  - [ ] "Service Only" toggle → glass rate nikal jaye, pieces phir bhi banein
  - [ ] Finance → GL Posted tab → Edit/Delete na ho (Locked)
  - [ ] Company switch → finance report naye company ke numbers
  - **→ Jo fail ho uska screenshot / message Claude ko bhejo.**

- [ ] **Migration `083_cutter_workflow.sql` apply karo** (Supabase SQL editor). Standalone Glassco se aayi — multitenant mein missing thi. Iske baghair cutter ka "Pending-Cut → Cut" cloud pe reject hota hai (abhi local pe chal jata, cloud pe nahi). Idempotent (IF NOT EXISTS) — do baar chale to bhi safe. File: `supabase/migrations/083_cutter_workflow.sql`.

---

## 🟡 Decisions — Claude ko batao (yes/no)

- [ ] **P1-15 — Nippon un-costed stock ka rule:** jab item receive hone se pehle bik jaye (koi cost nahi), delivery pe cost-of-goods kis rate pe? Abhi selling price pe lag raha (margin zero). Options: (a) cost 0 rakho, (b) "go count/cost this" flag, (c) Service-Only jaisa handle. **Aap ka business faisla.**
- [ ] **Push to GitHub + Vercel deploy** karun ya abhi local rakhun? (Abhi saare commits sirf local hain — deployed app par aaj ke fixes NAHI hain.)

---

## ✅ Ho chuke (record)

- [x] **Tailwind CDN → build-time Tailwind** migrate — slow load + buttons-as-text theek. (2026-07-04, aap ne "kafi behter" confirm kiya)
- [x] **Production nav** wapas 2 alag: "Production Board" + "Production" (hub); canonical design tokens standalone se sync. (2026-07-04)
- [x] **Migration `092`** live DB pe apply — anon financial-leak band. (2026-07-04)
- [x] Migrations `088 / 089 / 090` apply + soft-delete flag flip (pehle).
- [x] Console errors + issues Claude ko bhej diye.

---

## 🔵 Claude abhi khud fix kar raha (aap ka action NAHI — sirf khabar ke liye)

| Issue | Kya hai | Status |
|---|---|---|
| **Tailwind CDN** | Slow load + buttons-as-text ka root cause | ✅ ho gaya (build-time Tailwind) |
| **Glassco Sales Order tab empty** | Approve ki hui Glassco quotation SO tab mein nahi aati (Nippon theek) | ⏳ investigating |
| **production_pieces sync fail** | Live DB mein `cost_center_id` column missing → pieces cloud pe sync nahi | ⏳ Claude fix karega (code ya chhoti migration) |
| **2026-05 period-lock** | Sahi behavior (band period) — bs ek atki ledger entry | ℹ️ May kholni ho to batao, warna theek hai |

---

## 🔄 Standalone → Multitenant sync (2026-07-04) — khabar ke liye

Aap ne kaha standalone Glassco pe advanced changes ki hain, multitenant mein bhi laao.
Claude ne dono repos file-by-file compare kiye. **Aham baat:** zyada-tar files mein
**multitenant AAGE hai** (audit fixes + multi-company logic jo standalone mein nahi) —
isliye standalone ko andha-dhund copy karna galat hota (audit fixes urr jate). Sirf 4
genuine cheezein port huin:

- `083_cutter_workflow.sql` (upar apply-list mein).
- `ProductionContext.tsx` — direct-delivery ab COGS **pehle** post karta hai (fail ho to
  kuch commit nahi hota, pehle Delivered mark ho jata tha bina COGS ke); job orders +
  clients cloud se load (fresh route pe blank-screen fix).
- `productionService.ts` — cutter attribution (cut_by/cut_at) read.
- KPI catalog doc.

Baaki (SyncService, useGlasscoQuotations, hrService, inventoryService, UserAccessManager,
App.tsx, waghera) **jaan-boojh kar chhori** — multitenant unmein pehle se behtar/aage hai
(porting se P1-8/P1-9/P1-11/Service-Only jaise fixes ULT jate).

---

## 📌 Deferred (baad mein — abhi nahi)

- 6 remaining P1 (2 DB-migration, P1-15 decision, 1 low-pri GTK, baaki analysis) — Claude ke paas documented.
- 32 P2 + 11 P3 backlog — `GLASSCO_FUNCTIONAL_AUDIT_2026-07.md` mein.
- GTK + Factory scaffolding.

---
_Detail: `GLASSCO_FUNCTIONAL_AUDIT_2026-07.md` (poori audit report, parhne ke liye — SQL editor mein NA chalana)._
