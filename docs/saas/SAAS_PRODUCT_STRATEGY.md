# GlassTech AgentOS — SaaS Product Strategy

**Date:** 2026-04-18
**Status:** Pre-launch (Pilot Phase)
**Target Launch:** June 2026

---

## Ideal Customer Profile

**Primary ICP:**
- Industry: Glass, steel, marble, aluminum, textile manufacturing
- Size: 20-200 employees, PKR 50M-500M annual revenue
- Location: Karachi, Lahore, Faisalabad, Sialkot
- Pain: Manual Excel/WhatsApp, no real-time visibility, no automation
- Decision maker: Owner-operator or Finance Director
- Tech literacy: Low-medium (no IT department)

**Disqualifiers:** Already on SAP/Oracle, <15 employees, >500 employees, service industry

---

## Pricing Model

| Feature | Starter PKR 75K/mo | Professional PKR 125K/mo | Enterprise PKR 200K/mo |
|---|---|---|---|
| Companies | 1 | 3 (consolidation) | Unlimited |
| Users | 25 | 50 | Unlimited |
| Core modules | Sales, Purchase, Inventory, Finance | + Production, QC, Job Costing | + Custom modules (2/yr) |
| EventOS | 8 patterns | Custom patterns | Unlimited + API |
| Decision Agents | Read-only | Autonomous + approval | Full autonomy |
| Agent API calls | 500/mo | 2,000/mo | 5,000/mo |
| WhatsApp/Telegram | No | Yes | Yes |
| Intercompany | No | IAS 24 settlement | + IFRS 10 consolidation |
| Support | Email 48hr | Priority 24hr | SLA 4hr |

**Add-ons:** Extra API calls PKR 10/1000, WhatsApp setup PKR 25K one-time, Data migration PKR 50-150K, On-site training PKR 30K/day.

---

## Competitive Analysis

| Competitor | Price | AI Agents | Urdu | Manufacturing | Our Edge |
|---|---|---|---|---|---|
| Odoo Pakistan | PKR 50-80K | No | No | Generic | AI + Urdu + domain |
| ERPNext | PKR 0-60K | No | No | Partial | Turnkey + AI + support |
| Local ERPs | PKR 40-100K | No | Partial | Yes | Modern UI + AI + cloud |
| Excel/WhatsApp | Free | No | Yes | Manual | EventOS makes ERP = WhatsApp |
| SAP/Oracle | USD 50-500K | Yes (Joule) | No | Yes | 100x cheaper |

**Moat:** AI agents (18-month lead), Roman Urdu NLP, manufacturing domain, organic learning (agents improve per client).

---

## Go-to-Market (12 Months)

| Phase | Months | Action | Target |
|---|---|---|---|
| 1. Pilot | 1-3 | 3 clients at 50% discount, weekly check-ins | 2/3 renew full price |
| 2. Content | 2-6 | LinkedIn cases, YouTube demos, blog series | 50 qualified leads |
| 3. Referral | 4-6 | PKR 10K credit per referral, 1 month free | 30% from referrals |
| 4. Events | 6-12 | PGMA events, KCCI summit, Textile Asia booth | 20 trials |
| 5. Accelerator | 6-9 | Antler Karachi + YC W2027 application | Funding + network |

---

## Revenue Projections

| Month | Clients | Avg MRR/Client | Total MRR | Cumulative ARR |
|---|---|---|---|---|
| 3 | 3 (pilot) | PKR 37.5K | PKR 112K | PKR 1.3M |
| 6 | 8 | PKR 75K | PKR 487K | PKR 5.8M |
| 9 | 15 | PKR 100K | PKR 1.19M | PKR 14.3M |
| 12 | 20 | PKR 110K | PKR 1.81M | PKR 21.7M |

**Break-even:** 15 clients at PKR 75K avg (PKR 1.125M MRR) vs PKR 1.15M/mo costs.

---

## Validation Questions — Answers

### 1. Realistic sales cycle for PKR 100K/month ERP to Pakistani manufacturer?

**4-8 weeks** from first contact to signed contract:
- Week 1-2: Discovery call + pain point mapping
- Week 2-3: Live demo with client's own data (sample CSV import)
- Week 3-4: Trial period (2 weeks free, EventOS processing real messages)
- Week 4-6: Proposal + negotiation (owner wants discount, annual payment)
- Week 6-8: Contract + onboarding

Key: Owner must see it working with their own data. Abstract demos don't convert in Pakistan market.

### 2. Lead with ERP or AI agent angle?

**Lead with pain, close with AI:**
- Hook: "Aapka ERP Excel mein hai? Staff WhatsApp pe order bhejte hain? Galtiyan hoti hain?"
- Demo: Show EventOS processing a real staff message in Roman Urdu
- Close: "Yeh AI agent 24/7 kaam karta hai, galti nahi karta, aur seekhta jaata hai"

Don't lead with "AI" — Pakistani SME owners don't care about buzzwords. They care about: less errors, faster billing, real-time stock, staff don't need training.

### 3. How to protect business logic IP?

- **Code stays server-side** — clients access via Supabase Edge Functions, never see source code
- **Pattern library is per-client** — client's custom patterns are their data, but engine is ours
- **Decision memory is isolated** — client_id RLS prevents cross-client leakage
- **No self-hosted option** on Starter/Professional (keeps code controlled)
- **Enterprise on-premise** has separate license terms with source escrow
- **Key defense:** The value isn't in the code — it's in the agent learning. A competitor can copy code but can't copy 6 months of decision memory.

### 4. Minimum viable product for first external client?

**Core MVP (blocks launch):** Sales (quotations, invoices), Purchase (requisitions, GRN), Inventory (stock, valuation), Finance (GL, petty cash, trial balance), EventOS (8 patterns), User management + RBAC, Multi-tenant client_id.

**NOT needed for launch:** Production module, Decision Agents (autonomous mode), Custom pattern UI, Intercompany, Mobile app.

### 5. Emerging market SaaS founders and YC?

- **Paystack (Nigeria):** Applied 3 times before acceptance. Led with traction numbers, not tech.
- **Mono (Africa):** Solo founder initially. YC valued domain expertise + market access.
- **Bosta (Egypt):** Logistics SaaS. Applied with 50 clients, got in on market size.
- **Key for Hassan:** GlassTech's own usage IS traction. 5-company production ERP = proof it works. YC values founder-market fit. Manufacturing owner building manufacturing ERP = perfect fit.
- **Apply to YC S2027 or W2027.** Antler Karachi is faster (3 months vs 6 months wait).
