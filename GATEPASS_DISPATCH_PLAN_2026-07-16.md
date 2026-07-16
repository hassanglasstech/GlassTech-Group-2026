# Store-Issue → Gate Pass → Factory Gatekeeper — God-Mode Design (2026-07-16)

The end-to-end **Order → Pick → Gate Pass → Gate-Out → Delivered** chain across
four people (Office · Store · Gatekeeper · Driver) and — critically — across all
group companies at one shared factory gate. This is the flow that turns the ERP
from "software the office uses" into "the system that runs the physical gate."

## What already exists (build ON this, not from scratch)
- `GatePass` entity + `ProductionService.get/saveGatePasses` — id, company, type, vehicleNo, driverName, materialDetails, qty, tare/gross weight, isReturnable, timestamp, status, linkedDispatchId. **Today it's glass/tempering-centric.**
- `FactoryGateControl.tsx` (factory app) + `GuardScreen.tsx` (glassco guard verify) — issue/verify passes against `tempering_dispatches`.
- `GatePassPrint.tsx` — printable pass.
- POD stack (driver photo + customer signature + OTP + `pod_completed_at`) — bound to tempering dispatches.
- `crossCompanyNotifService` — real-time Supabase channel (already used cross-company).
- `StoreIssueScreen.tsx` (Nippon) — the store incharge pick/issue screen (built this session).
- Factory is a first-class company + `FactoryInchargeModule` + `/factory-incharge` route.

**Gap:** all of the above is single-flow (Glassco glass). The vision needs it (a) generalized to trading/Nippon orders, (b) a cross-company gatekeeper, (c) instructions + bins + partial pick, (d) QR verify, (e) auto in/out timing, (f) Urdu + voice for the gate.

---

## Industry standards this maps to (so we build to a known bar)
| Our stage | Industry discipline | Reference systems |
|---|---|---|
| Store pick w/ bin | **WMS directed picking** (bin-sorted pick list, confirm picked qty) | SAP EWM, Oracle WMS, Unleashed, Zoho |
| Gate pass | **e-Gate-Pass / e-Way-Bill / Delivery Challan** (authorizes goods to leave, tied to invoice) | FBR/Indian e-way bill, SAP outbound delivery |
| Gatekeeper in/out | **Gate & Yard Management (YMS)** — gate-in/out log, vehicle+driver, ANPR, weighbridge | SAP Yard Logistics, dock-scheduling tools |
| Driver slip | **Transport / carrier docs** | 3PL run sheets |
| Delivery | **POD** (signature/photo/OTP) | every last-mile app |
| The whole thing | **Segregation of duties** — office issues, store picks, guard verifies (3 people) — the #1 reason gate passes exist (leakage/fraud control) | audit/ICFR |

We're not inventing the workflow — we're delivering *enterprise gate/yard management* on a phone, in Urdu, for a Pakistani group that runs one shared gate.

---

## The flow — with the genius mechanisms baked in

**① Office / Sales — approve + instruct**
- On approve, office attaches **special instructions** (fragile / call-before-delivery / partial-ok / deliver-by) + **priority**.
- 🧠 *One instruction thread* is created here and rides the order all the way to the driver — nothing gets lost between four people.

**② Store Incharge — pick (extend StoreIssueScreen)**
- List → **click an order → full detail opens**: each line with **bin location**, qty, image, and the office instructions.
- 🧠 **Bin-sorted pick list** (walk-path): lines ordered by bin so the picker walks the aisle once.
- **Partial pick** + qty-confirmed per line; store adds **store notes** ("2 pcs damaged, substituted").
- Store's **saved list** = his live queue (pending) + issued history, persisted to his login.
- On "Issue" → physical stock-out (already built) → order → **Ready for Gate Pass**.

**③ Office — issue Gate Pass**
- From an issued order, office issues a **Gate Pass**: vehicle, driver, **driver phone**, returnable?, auto-pulling items + instructions.
- 🧠 **QR token** on the pass = tamper-proof. Guard scans → sees exactly the authorised items. No phone calls, no forged paper.
- Pass is **pushed real-time** to the Factory gatekeeper (crossCompanyNotifService).

**④ Factory Gatekeeper — the cross-company hub (extend FactoryGateControl → mobile)**
- Gatekeeper logs into the **Factory app** → **one queue of ALL companies' pending passes** (GTK · GTI · Glassco · Nippon).
- 🧠 **Dead-simple mobile UI** — big cards, huge IN/OUT buttons, sunlight-readable, glove-friendly. Company shown as a colored stripe.
- **Scan QR** (or tap) → vehicle + driver + items + instructions.
- 🧠 **"Timing = the tap"**: pressing **IN** / **OUT** stamps server time. The act of marking is the record — no separate form. → free **yard-time analytics** (which company/driver sits longest) with zero extra entry.
- 🧠 **Voice note**: guard records a short voice note on the pass ("driver keh raha 2 box kam hain", "plate number alag hai"). MediaRecorder → Supabase storage → office plays it (optional Urdu speech-to-text). Built for a guard who won't type.
- 🧠 **Urdu driver slip (Noori Nastaliq)**: the pass renders a big, clear **Urdu instruction slip** — kya le kar ja raha hai, kahan deliver karna, koi khaas hidayat, phone number. Mobile-first, low-literacy-friendly.

**⑤ Delivery / POD (reuse existing)**
- Driver delivers → POD (signature/photo/OTP) → order **Delivered**.
- 🧠 **Round-trip clock**: gate-out → delivered → (returnable) gate-in-back — full trip timeline visible to office.

---

## What makes OUR product unique (the moat)
1. **One gatekeeper, all companies.** A single guard at the shared gate clears GTK+GTI+Glassco+Nippon from one queue. Off-the-shelf ERPs are single-tenant; the group's real gate is shared — nobody sells this cleanly.
2. **QR-verified gate pass = segregation of duties on a phone.** Office issues, store picks, guard scans — three roles, tamper-proof, no paper forgery.
3. **"Timing is the tap."** In/out logging with zero data entry → yard-dwell analytics for free.
4. **Noori Nastaliq Urdu driver slip + guard voice notes.** Built for the *actual humans* at a Pakistani gate — an illiterate guard and an Urdu-only driver. SAP/Odoo will *never* ship a Noori Nastaliq slip or a guard voice-note-to-office loop. **This localization + empathy is the real differentiator.**
5. **Voice-to-office loop.** The guard's voice note reaches the office instantly (WhatsApp-native behavior) — closes the "guard couldn't reach anyone" gap.
6. **Offline-first gate.** Factory wifi is spotty; the guard app works offline and syncs — passes never get stuck.

---

## Data model (extend, minimal migration)
- **`GatePass`** add: `linkedOrderId` (not only dispatch), `driverPhone`, `instructions`, `voiceNoteUrl`, `qrToken`, `gateInAt`, `gateOutAt`, `returnedAt`, per-line items+bin. (jsonb `data` blob can carry most without a migration; timing/qrToken want real columns for querying.)
- **Order/Quotation** add: `specialInstructions`, `priority`, per-line `binLocation`, store `pickedAt/pickedBy/storeNotes`.
- **Storage bucket** `gatepass-voice` for guard voice notes.
- Reuse: `crossCompanyNotifService` (push), POD tables, `activeCompany()`/RLS (guard sees all companies → a **factory/gatekeeper role** that is company-agnostic, gated by a `gatekeeper` module).

## Phased build (each = own verified slice, browser-tested)
- **A · Store depth** — order-detail-on-click + bin + instructions + partial pick + saved list. *(extends StoreIssueScreen — mostly done spine)*
- **B · Gate-pass link** — office issues pass from an issued order (QR + driver phone) → real-time push to gatekeeper.
- **C · Gatekeeper app** — cross-company queue + QR scan + one-tap IN/OUT (auto-timing) + dead-simple mobile.
- **D · Urdu + Voice** — Noori Nastaliq driver slip; guard voice note → storage → office playback.
- **E · Loop** — yard-time + trip-timing + returnable + POD tie-in + office dashboard.

**Voice question — answer:** Yes, easily. `MediaRecorder` (mobile browser) → record → upload to `gatepass-voice` bucket → attach URL to the pass → office plays it. Optional: an edge function transcribes Urdu (Whisper) to text. No native app needed.

**Font question:** Noori Nastaliq via an embedded web font (Jameel Noori Nastaleeq / Alvi Nastaleeq) loaded as `@font-face` (self-hosted woff2) so the driver slip renders true Urdu on any phone — no OS dependency.
