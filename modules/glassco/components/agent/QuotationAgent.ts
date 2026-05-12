// ═══════════════════════════════════════════════════════════════════════════
// QuotationAgent.ts — Glassco AI Quotation Generator
//
// Role: The agent knows EVERYTHING about Glassco quotations:
//   • Product catalog (glass types, thickness, base/tempering prices)
//   • Service catalog (T/G, P/E, R/D, Notch, D/G, APT, Holes, Frosted)
//   • Sizing & rounding rules (inch-based, 6"/12" grid)
//   • GL implications per line item (COGS, WIP-Labour, AP-Tempering)
//   • IAS 2 cost structure (DM + DL + OH)
//   • Multi-turn conversation: user says "make it tempered" → agent updates
//
// Architecture:
//   User message → agentic_loop (max 5 rounds) → tool calls execute live
//   data → Claude synthesizes → structured Quotation JSON returned
//
// Tools (6):
//   get_glass_options     → Product master: all glass types/rates
//   get_service_catalog   → Service products: all service rates per mm
//   get_client_info       → Client master: history, credit, site
//   check_inventory       → Live stock: qty, MAP, availability
//   calculate_item        → GlasscoUtils exact math: sqft, amount, aptCharges
//   save_quotation        → SalesService.saveQuotations() persist
// ═══════════════════════════════════════════════════════════════════════════

import {
  callClaude,
  ClaudeToolDef,
  ClaudeMessage,
  ContentBlock,
} from '@/modules/factory/services/claudeAgentService';
import { SalesService }     from '@/modules/sales/services/salesService';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import {
  calculateAutoRate,
  calculateLineItemTotal,
  getBillingDimension,
} from '@/modules/glassco/core/GlasscoUtils';
import { Quotation, QuotationItem, GlassServiceCharge, Product } from '@/modules/shared/types';
import { Company } from '@/modules/shared/types/core';
import { errMsg } from '@/modules/shared/services/utils';

// ── Constants ────────────────────────────────────────────────────────────
const AGENT_ID = 'quotation-agent';
const MODEL    = 'claude-sonnet-4-6';          // Precision work — use Sonnet
const MAX_TOOL_ROUNDS = 5;                      // Max agentic loop iterations

// ── Exported Types ───────────────────────────────────────────────────────

export interface QuotationAgentMessage {
  role:       'user' | 'assistant';
  content:    string;
  toolsUsed?: string[];                         // which tools fired this round
  quotation?: Partial<Quotation>;               // if agent produced/updated a quotation
  timestamp:  string;
}

export interface QuotationAgentResult {
  quotation:   Quotation | null;
  explanation: string;
  toolsUsed:   string[];
  savedId?:    string;                          // set if save_quotation was called
  messages:    QuotationAgentMessage[];
}

export interface QuotationAgentSession {
  history:  ClaudeMessage[];                   // full conversation for multi-turn
  company:  Company;
}

// ── System Prompt ─────────────────────────────────────────────────────────
//
// This is the agent's "brain" — everything it needs to know about
// Glassco quotations, pricing, GL, and ERP business rules.
//
const buildSystemPrompt = (company: Company): string => `
You are the GlassTech ERP Quotation Specialist for ${company}.
You have deep expertise in glass processing, IAS 2 absorption costing,
and this company's exact pricing and GL structure.

══ GLASS CATALOG ══
Glass is priced per sqft (PKR). Types available:
  • Plain / Clear    — standard float glass
  • Mirror           — Mirror Standard | Belgian | One Side (subCategories)
  • Color / Tinted   — CFG | Euro Grey | Brown | Tinted (subCategories)
  • Fluted           — patterned, fixed sizes
Thickness available: 4mm · 5mm · 6mm · 8mm · 10mm · 12mm
ALWAYS call get_glass_options() to get live rates — never assume prices.

══ SERVICE CATALOG ══
Services add to per-sqft rate OR are flat fees:

  T/G  (Tempering)       — Uses temperingPrice (NOT basePrice) from glass product.
                           External vendor. Rate varies by mm. No P/E or R/D or Notch
                           charges apply when T/G is selected (already included).
  P/E  (Polish Edge)     — Per-sqft adder. Internal service. Polish Operators.
  R/D  (Rough Dhar)      — Grinding/beveling. Per-sqft adder. Internal.
  Notch                  — Per-notch flat cost. Internal. Machine Operators.
  D/G  (Double Glazing)  — Doubles the billing sqft. No extra per-sqft charge.
  APT  (Anti-Process)    — For MIRRORS only: per-sqft rate + PKR 1,000 flat per piece.
  Frosted / Sandblast    — Per-sqft adder.
  Holes                  — Per-hole charge. Not charged if T/G selected.
ALWAYS call get_service_catalog() to get live rates.

══ SIZING & ROUNDING RULES (CRITICAL) ══
All dimensions in INCHES. Billing dimensions are ROUNDED UP:
  Width  ≤ 72":  round UP to nearest 6"
  Width  > 72":  round UP to nearest 12"
  Height < 120": round UP to nearest 6"
  Height ≥ 120": round UP to nearest 12"

totalSqFt = (billingW × billingH) / 144 × qty × (2 if D/G)
ALWAYS call calculate_item() — never do this math manually.

══ SPECIAL PRICING RULES ══
1. Mirror + APT = PKR 1,000 per piece EXTRA (in addition to per-sqft APT rate)
2. T/G disables Notch, P/E, R/D charges (these are not charged when tempered)
3. D/G: report sqft as doubled in the line item (client billed for both panes)
4. Holes: charged separately, not per-sqft. Use notch rate × number of holes.
5. Manual sqft override: if client specifies exact area (isManualSqFt = true)

══ QUOTATION STRUCTURE ══
Each line item (QuotationItem) has:
  id, description, locationCode, qty, width(inch), height(inch),
  glassSize (e.g. "6mm"), glassType, subCategory,
  selectedServices[], totalSqFt, pricePerUnit (PKR/sqft), amount (PKR total),
  aptCharges (PKR flat, Mirror+APT only)

Footer items (GlassServiceCharge[]) — flat PKR amounts:
  delivery, installation, site labour, scaffolding, etc.

══ DISCOUNT LOGIC ══
  glassDiscountPercent: discount on glass items only
  discountPercent: overall discount on grand total
  discountAmount: fixed amount override
  gross = Σ item.amount + Σ item.aptCharges + Σ serviceCharges
  net = gross − discount

══ GL IMPLICATIONS (for your context — explain to user if asked) ══
Each quotation line, on delivery, creates:
  Dr 5111 COGS-Glass (MAP × sqft)     / Cr 11511 Glass Inventory
  Dr 51311 COGS-Cutting labour        / Cr 11514 WIP-Direct-Labour
  Dr 51312 COGS-Processing labour     / Cr 11514 WIP-Direct-Labour
Tempering vendor bill:
  Dr 11513 WIP (per-mm exact rate)    / Cr 22113 AP-Tempering Vendor
Revenue on invoice:
  Dr 12210 AR-Client                  / Cr 41110 Service Income

══ YOUR WORKFLOW ══

PHASE 1 — GATHER (do this on EVERY new quotation request):
  a. Call get_glass_options() and get_service_catalog() silently (no need to narrate).
  b. If client name is mentioned → call get_client_info().
     • If client NOT FOUND → inform the user and ask if they want to proceed as walk-in
       or if they meant a different name.
     • If client FOUND → mention their name + any outstanding balance briefly.
  c. After fetching, DO NOT generate a quotation yet.
  d. Instead, identify every missing piece of information from this checklist:

     REQUIRED FIELDS CHECKLIST:
     [ ] Client name / walk-in confirmed?
     [ ] Glass type & thickness? (may already be in request)
     [ ] Dimensions (width × height in inches)?  (may already be in request)
     [ ] Quantity?  (may already be in request)
     [ ] Services beyond what was mentioned?
         → For TEMPERED glass: ask if P/E (Polish Edge), Notch, or Holes are needed
           (these are NOT included with T/G — they're charged separately only if requested)
         → For NON-tempered: ask if T/G, P/E, R/D, Holes are needed
         → Ask if D/G (Double Glazing) is needed
     [ ] Delivery charges? (flat amount, or "no delivery")
     [ ] Discount? ("koi discount nahi" is a valid answer — 0%)
     [ ] Due date / validity? (default is 30 days — confirm or ask)
     [ ] Site name / project name? (can be "N/A" but ask)
     [ ] Architect name? (can be "N/A")

  e. Bundle ALL missing questions into ONE single message — numbered list, friendly tone.
     Example format:
     "Ali Builders mil gaye ✓ (outstanding: PKR 45,000). Kuch cheezein confirm karni hain:
      1. Tempering ke saath Polish Edge (P/E) bhi chahiye?
      2. Notches ya holes chahiye? Kitne?
      3. Delivery charges include karni hain? (amount batayein ya "nahi")
      4. Koi discount? (percent ya fixed amount, ya "koi nahi")
      5. Due date / validity? (default: 30 din)
      6. Site/project ka naam? (ya "N/A")
      Sab batao to main quotation tayar karta hoon!"

  f. WAIT for the user's answers before moving to Phase 2.
     Exception: if the user's original message already answered ALL checklist items,
     skip directly to Phase 2.

PHASE 2 — CALCULATE (only after all info confirmed):
  a. For EACH line item → call calculate_item() with exact confirmed dimensions.
  b. Build the complete Quotation JSON with all confirmed fields.
  c. Output the quotation block + human-readable breakdown.
  d. End with: "Yeh quotation save karein? (haan/nahi)"

PHASE 3 — SAVE (only when user confirms):
  a. Call save_quotation() with all details.
  b. Confirm with the saved ID.

REFINEMENTS (after a quotation is shown):
  • User says "make it 8mm" → recalculate, show updated quotation.
  • User says "add delivery 2500" → add service charge, recalculate.
  • User says "remove polish edge" → recalculate without P/E.
  • Each refinement → re-call calculate_item() → new JSON block + updated summary.

IMPORTANT RULES:
  • NEVER assume services — always ask explicitly.
  • NEVER assume discount is zero — always ask.
  • NEVER skip the missing-info phase unless TRULY everything is already given.
  • If user provides partial answers, ask only for what's still missing.
  • Be warm, concise, and helpful — this is a business tool not a formal interview.
  • Respond in the same language the user is using (Urdu/English mix is fine).

══ OUTPUT FORMAT ══
When returning a quotation, include a JSON block:
\`\`\`quotation
{ ...complete Quotation object... }
\`\`\`
AND a human-readable summary with line-by-line breakdown.
Show: each item (description, qty, size, services, sqft, rate, amount), service charges,
gross total, discount, and NET TOTAL in bold.

Today's date: ${new Date().toISOString().split('T')[0]}
Company: ${company}
`.trim();

// ── Tool Definitions ──────────────────────────────────────────────────────

const QUOTATION_TOOLS: ClaudeToolDef[] = [
  {
    name: 'get_glass_options',
    description:
      'Fetch all glass products from the product master. ' +
      'Returns glass types, thicknesses, base prices, and tempering prices. ' +
      'MUST be called before building any quotation item.',
    input_schema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name, e.g. Glassco' },
        glassType: {
          type: 'string',
          description: 'Optional filter: Plain | Mirror | Color | Fluted',
        },
        thickness: {
          type: 'string',
          description: 'Optional filter: 4mm | 5mm | 6mm | 8mm | 10mm | 12mm',
        },
      },
      required: ['company'],
    },
  },
  {
    name: 'get_service_catalog',
    description:
      'Fetch all service products (T/G, P/E, R/D, Notch, D/G, APT, Frosted, Holes) ' +
      'with their per-sqft rates for a given glass thickness. ' +
      'MUST be called to get accurate service adder rates.',
    input_schema: {
      type: 'object',
      properties: {
        company:   { type: 'string' },
        thickness: { type: 'string', description: 'e.g. 6mm — filters services for this thickness' },
      },
      required: ['company'],
    },
  },
  {
    name: 'get_client_info',
    description:
      'Look up a client by name (partial match supported). ' +
      'Returns client details, credit limit, outstanding balance, and past quotation history.',
    input_schema: {
      type: 'object',
      properties: {
        company:    { type: 'string' },
        clientName: { type: 'string', description: 'Client name or partial name to search' },
      },
      required: ['company', 'clientName'],
    },
  },
  {
    name: 'check_inventory',
    description:
      'Check live inventory stock for a glass type and thickness. ' +
      'Returns available quantity, Moving Average Price (MAP), and sheet sizes in stock.',
    input_schema: {
      type: 'object',
      properties: {
        company:   { type: 'string' },
        glassType: { type: 'string', description: 'e.g. Plain | Mirror | Tinted' },
        thickness: { type: 'string', description: 'e.g. 6mm' },
      },
      required: ['company', 'glassType'],
    },
  },
  {
    name: 'calculate_item',
    description:
      'Calculate exact billing sqft, amount, and aptCharges for one quotation line item. ' +
      'Applies rounding rules, D/G doubling, T/G service logic, and Mirror+APT flat charges. ' +
      'MUST be called for every line item — never compute amounts manually.',
    input_schema: {
      type: 'object',
      properties: {
        company:          { type: 'string' },
        description:      { type: 'string', description: 'Line item description, e.g. "Living Room — 6mm Plain T/G"' },
        locationCode:     { type: 'string', description: 'Location reference, e.g. "LR-01"' },
        qty:              { type: 'number',  description: 'Number of pieces' },
        widthInch:        { type: 'number',  description: 'Width in inches (before rounding)' },
        heightInch:       { type: 'number',  description: 'Height in inches (before rounding)' },
        glassSize:        { type: 'string',  description: 'Thickness, e.g. "6mm"' },
        glassType:        { type: 'string',  description: 'e.g. Plain | Mirror | Color' },
        subCategory:      { type: 'string',  description: 'e.g. Standard | Belgian | Tinted | CFG' },
        selectedServices: {
          type: 'array', items: { type: 'string' },
          description: 'Service codes, e.g. ["T/G", "Notch"] or ["P/E", "R/D"]',
        },
        notchCount:  { type: 'number',  description: 'Number of notches if Notch service selected' },
        finishColor: { type: 'string',  description: 'e.g. Clear | Euro Grey | Brown' },
        isDoubleGlaze: { type: 'boolean', description: 'Set true if D/G — doubles sqft' },
      },
      required: ['company', 'qty', 'widthInch', 'heightInch', 'glassSize', 'glassType'],
    },
  },
  {
    name: 'save_quotation',
    description:
      'Save the completed quotation to the ERP. ' +
      'Call this only when the user confirms they want to save. ' +
      'Returns the saved quotation ID.',
    input_schema: {
      type: 'object',
      properties: {
        company:          { type: 'string' },
        clientId:         { type: 'string',  description: 'Client ID from get_client_info result' },
        clientName:       { type: 'string',  description: 'Client display name' },
        projectName:      { type: 'string' },
        site:             { type: 'string' },
        architect:        { type: 'string',  description: 'Architect name or N/A' },
        subject:          { type: 'string' },
        items:            { type: 'array',   description: 'Array of QuotationItem objects (from calculate_item results)' },
        serviceCharges:   {
          type: 'array',
          description: 'Flat charges: [{ description: "Delivery", amount: 2000 }]',
        },
        discountPercent:  { type: 'number',  description: 'Overall discount %, default 0' },
        discountAmount:   { type: 'number',  description: 'Fixed discount amount, default 0' },
      },
      required: ['company', 'clientName', 'items'],
    },
  },
];

// ── Tool Executor ─────────────────────────────────────────────────────────

function executeTool(
  toolName: string,
  params:   Record<string, any>,
  company:  Company,
): unknown {
  const co = (params.company as Company) || company;

  switch (toolName) {

    // ── get_glass_options ────────────────────────────────────────────
    case 'get_glass_options': {
      const products = SalesService.getProducts()
        .filter((p: Product) => {
          if (p.company && p.company !== co) return false;
          if ((p.category || '').toLowerCase() !== 'glass') return false;
          if (params.glassType) {
            const t = params.glassType.toLowerCase();
            if (!(p.glassType || '').toLowerCase().includes(t) &&
                !(p.subCategory || '').toLowerCase().includes(t)) return false;
          }
          if (params.thickness) {
            if ((p.thickness || '') !== params.thickness) return false;
          }
          return true;
        })
        .map((p: Product) => ({
          id:             p.id,
          name:           p.description || `${p.glassType} ${p.thickness}`,
          glassType:      p.glassType,
          subCategory:    p.subCategory,
          thickness:      p.thickness,
          finishColor:    p.finishColor,
          basePrice:      p.basePrice,
          temperingPrice: p.temperingPrice,
          unit:           p.unit,
        }));

      return {
        count: products.length,
        products,
        note: products.length === 0
          ? 'No products found — check product master is populated'
          : `${products.length} glass options available`,
      };
    }

    // ── get_service_catalog ──────────────────────────────────────────
    case 'get_service_catalog': {
      const thickness = params.thickness || '';
      const services = SalesService.getProducts()
        .filter((p: Product) => {
          if (p.company && p.company !== co) return false;
          if ((p.category || '').toLowerCase() !== 'service') return false;
          return true;
        })
        .map((p: Product) => ({
          id:          p.id,
          serviceNick: p.serviceNick,
          name:        p.description,
          thickness:   p.thickness || 'All',
          basePrice:   p.basePrice,
          unit:        p.unit,
        }));

      // Group by serviceNick for easier reading
      const byNick: Record<string, typeof services[number][]> = {};
      services.forEach((s) => {
        const nick = s.serviceNick ?? 'Unknown';
        if (!byNick[nick]) byNick[nick] = [];
        byNick[nick].push(s);
      });

      // If thickness specified, also return matched rates
      const matched: Record<string, number> = {};
      if (thickness) {
        const normalize = (s: string) => String(s || '').trim().toLowerCase();
        services.forEach((s) => {
          const thkMatch = normalize(s.thickness) === normalize(thickness) ||
                           normalize(s.thickness) === 'all' ||
                           !s.thickness;
          if (thkMatch && s.serviceNick) {
            if (!matched[s.serviceNick]) matched[s.serviceNick] = s.basePrice;
          }
        });
      }

      return {
        services,
        byNick,
        matchedRatesForThickness: thickness ? matched : 'No thickness filter applied',
        note: `${services.length} service products. T/G: uses glass temperingPrice, not service rate.`,
      };
    }

    // ── get_client_info ──────────────────────────────────────────────
    case 'get_client_info': {
      const search = (params.clientName || '').toLowerCase();
      const allClients = SalesService.getClients()
        .filter((c) => !c.company || c.company === co);

      const matched = allClients.filter((c) =>
        (c.name || '').toLowerCase().includes(search)
      );

      if (matched.length === 0) {
        return { found: false, message: `No client found matching "${params.clientName}"`, suggestions: allClients.slice(0, 5).map((c) => c.name) };
      }

      const client = matched[0];
      const allQuotations = SalesService.getQuotations()
        .filter((q) => q.company === co && q.clientId === client.id);

      const recentQuotes = allQuotations
        .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 3)
        .map((q) => ({
          id:          q.id,
          orderNo:     q.orderNo,
          date:        q.date,
          projectName: q.projectName,
          status:      q.status,
          totalAmount: (q.items || []).reduce((s: number, i) => s + (i.amount || 0), 0),
        }));

      const outstanding = SalesService.getInvoices()
        .filter((i) => i.clientId === client.id && i.status !== 'Paid')
        .reduce((s: number, i) => s + (i.balance || 0), 0);

      return {
        found:        true,
        id:           client.id,
        name:         client.name,
        phone:        client.phone,
        address:      client.address,
        creditLimit:  (client as any).creditLimit || 0,
        outstanding,
        availableCredit: Math.max(0, ((client as any).creditLimit || 0) - outstanding),
        recentQuotes,
        totalQuotes:  allQuotations.length,
        multiplePossibleMatches: matched.length > 1 ? matched.map((c) => c.name) : undefined,
      };
    }

    // ── check_inventory ──────────────────────────────────────────────
    case 'check_inventory': {
      const glassType = (params.glassType || '').toLowerCase();
      const thickness = (params.thickness || '').replace('mm', '').trim();

      const stock = InventoryService.getStore()
        .filter((s) => {
          if (s.company !== co) return false;
          if ((s.category || '').toLowerCase() !== 'raw') return false;
          const name = (s.name || '').toLowerCase();
          const typeOk = glassType === 'plain'
            ? !name.includes('mirror') && !name.includes('tint') && !name.includes('color')
            : name.includes(glassType);
          const thkOk  = thickness ? name.includes(thickness) : true;
          return typeOk && thkOk;
        })
        .map((s) => {
          // StoreItem strict type lacks `thickness`/`dimensions`/`size`/`movingAveragePrice` —
          // these are runtime extensions populated by InventoryService. Cast for access.
          const sExt = s as typeof s & { thickness?: string; dimensions?: string; size?: string; movingAveragePrice?: number; unrestrictedQty?: number; lastMovementDate?: string };
          return {
            id:                s.id,
            name:              s.name,
            thickness:         sExt.thickness || thickness,
            availableQty:      sExt.unrestrictedQty || s.quantity || 0,
            unit:              s.unit || 'Sheet',
            movingAveragePrice: sExt.movingAveragePrice || 0,
            sheetSize:         sExt.dimensions || sExt.size || 'N/A',
            lastMovement:      sExt.lastMovementDate,
          };
        });

      const totalSheets = stock.reduce((s: number, i) => s + i.availableQty, 0);
      return {
        items:       stock,
        totalSheets,
        available:   totalSheets > 0,
        note: totalSheets === 0
          ? `No ${params.glassType} ${params.thickness || ''} stock found — check inventory`
          : `${totalSheets} sheets available`,
      };
    }

    // ── calculate_item ────────────────────────────────────────────────
    case 'calculate_item': {
      const products = SalesService.getProducts()
        .filter((p: Product) => !p.company || p.company === co);

      const services: string[] = params.selectedServices || [];
      const isDG = params.isDoubleGlaze || services.includes('D/G');

      // Build a QuotationItem shape for GlasscoUtils
      const mockItem: QuotationItem = {
        id:               `tmp-${Date.now()}`,
        description:      params.description || '',
        locationCode:     params.locationCode || '',
        glazingSpecs:     '',
        qty:              Number(params.qty) || 1,
        width:            Number(params.widthInch) || 0,
        height:           Number(params.heightInch) || 0,
        glassSize:        params.glassSize || '6mm',
        glassType:        params.glassType || 'Plain',
        subCategory:      params.subCategory || 'Standard',
        selectedServices: services,
        notchCount:       params.notchCount || 0,
        totalSqFt:        0,
        pricePerUnit:     0,
        amount:           0,
        isManualSqFt:     false,
      };

      // Get rate from product master
      const pricePerUnit = calculateAutoRate(
        params.glassSize || '6mm',
        params.glassType  || 'Plain',
        params.subCategory || 'Standard',
        services,
        products,
        params.finishColor,
      );
      mockItem.pricePerUnit = pricePerUnit;

      // Calculate exact sqft + amount
      const { totalSqFt, amount, aptCharges } = calculateLineItemTotal(mockItem, products);

      // Billing dimensions for transparency
      const billW = getBillingDimension(mockItem.width,  72,  true);
      const billH = getBillingDimension(mockItem.height, 120, false);

      return {
        // The final QuotationItem to include in quotation.items[]
        item: {
          ...mockItem,
          totalSqFt,
          pricePerUnit,
          amount,
          aptCharges,
        } as QuotationItem,
        // Breakdown for transparency
        breakdown: {
          inputW:       params.widthInch,
          inputH:       params.heightInch,
          billingW:     billW,
          billingH:     billH,
          qty:          mockItem.qty,
          isDG,
          totalSqFt,
          pricePerUnit,
          servicesApplied: services,
          amount,
          aptCharges,
          grandLineTotal: amount + aptCharges,
          note: isDG ? 'D/G: sqft doubled in billing' : '',
        },
      };
    }

    // ── save_quotation ────────────────────────────────────────────────
    case 'save_quotation': {
      const now      = new Date();
      const mmyy     = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
      const existing = SalesService.getQuotations();
      const seqNum   = String(existing.filter((q) => q.company === co).length + 1).padStart(4, '0');
      const qId      = `QT-GLS-${mmyy}-${seqNum}`;

      const dueDate  = new Date(now);
      dueDate.setDate(dueDate.getDate() + 30);

      const newQuotation: Quotation = {
        id:                qId,
        orderNo:           qId,
        company:           co,
        date:              now.toISOString().split('T')[0],
        clientId:          params.clientId || 'WALK-IN',
        projectName:       params.projectName || '',
        architect:         params.architect   || 'N/A',
        site:              params.site        || '',
        subject:           params.subject     || 'Glass Supply & Fabrication',
        items:             (params.items || []) as QuotationItem[],
        serviceCharges:    (params.serviceCharges || []) as GlassServiceCharge[],
        discountPercent:   Number(params.discountPercent)  || 0,
        discountAmount:    Number(params.discountAmount)   || 0,
        glassDiscountPercent: 0,
        status:            'Draft' as any,
        dueDate:           dueDate.toISOString().split('T')[0],
        expiryDate:        dueDate.toISOString().split('T')[0],
      } as any;

      // Attach clientName as display field
      (newQuotation as any).clientName = params.clientName || params.clientId || 'Walk-in';

      SalesService.saveQuotations([...existing, newQuotation]);

      const gross = (params.items || []).reduce(
        (s: number, i: any) => s + (i.amount || 0) + (i.aptCharges || 0), 0
      ) + (params.serviceCharges || []).reduce(
        (s: number, sc: any) => s + (sc.amount || 0), 0
      );
      const discount = Number(params.discountAmount) || (gross * (Number(params.discountPercent) || 0) / 100);
      const netAmount = gross - discount;

      return {
        success:    true,
        quotationId: qId,
        status:     'Draft',
        netAmount,
        message:    `Quotation ${qId} saved successfully — PKR ${netAmount.toLocaleString('en-PK')} net`,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Agentic Loop ──────────────────────────────────────────────────────────
//
// Implements the full multi-round tool-use pattern:
//   1. Send user message + tools to Claude
//   2. If stop_reason === 'tool_use': execute all tool calls, send results
//   3. Repeat until stop_reason === 'end_turn' or max rounds reached
//
async function agenticLoop(
  messages: ClaudeMessage[],
  company:  Company,
): Promise<{ finalText: string; allToolsUsed: string[]; finalMessages: ClaudeMessage[] }> {
  const allToolsUsed: string[] = [];
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callClaude({
      model:     MODEL,
      maxTokens: 4096,
      system:    buildSystemPrompt(company),
      messages:  currentMessages,
      tools:     QUOTATION_TOOLS,
      agentId:   AGENT_ID,
    });

    // Add assistant response to history
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
    ];

    // If no more tool calls — we're done
    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((b: ContentBlock) => b.type === 'text');
      return {
        finalText:     textBlock?.text || '',
        allToolsUsed,
        finalMessages: currentMessages,
      };
    }

    // Execute all tool calls in this round
    const toolUseBlocks = response.content.filter(
      (b: ContentBlock) => b.type === 'tool_use',
    );
    const toolResults: ContentBlock[] = [];

    for (const block of toolUseBlocks) {
      if (!block.name) continue;
      allToolsUsed.push(block.name);

      let result: unknown;
      try {
        result = executeTool(block.name, block.input || {}, company);
      } catch (err: unknown) {
        result = { error: errMsg(err, 'Tool execution failed') };
      }

      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id!,
        content:     JSON.stringify(result),
      });
    }

    // Feed results back
    currentMessages = [
      ...currentMessages,
      { role: 'user', content: toolResults },
    ];
  }

  // Max rounds hit — return what we have
  const lastAssistant = [...currentMessages].reverse().find(m => m.role === 'assistant');
  const lastContent   = Array.isArray(lastAssistant?.content)
    ? (lastAssistant!.content as ContentBlock[]).find(b => b.type === 'text')?.text
    : (lastAssistant?.content as string) || '';

  return {
    finalText:     lastContent || 'Agent reached maximum reasoning rounds.',
    allToolsUsed,
    finalMessages: currentMessages,
  };
}

// ── Extract Quotation from Agent Response ────────────────────────────────

function extractQuotation(text: string): Partial<Quotation> | null {
  // Agent wraps JSON in ```quotation ... ``` block
  const match = text.match(/```quotation\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as Partial<Quotation>;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════

/**
 * generateQuotation — Single-shot: user describes requirements in natural language,
 * agent returns a complete quotation.
 *
 * @example
 * const result = await generateQuotation(
 *   'Make a quotation for Ali Builders — 10 pieces 6mm plain tempered, 48x60 inches',
 *   'Glassco'
 * );
 */
export async function generateQuotation(
  userRequest: string,
  company:     Company,
): Promise<QuotationAgentResult> {
  const messages: ClaudeMessage[] = [
    { role: 'user', content: userRequest },
  ];

  const { finalText, allToolsUsed, finalMessages } = await agenticLoop(messages, company);
  const quotation = extractQuotation(finalText);

  // Build readable message history
  const agentMessages: QuotationAgentMessage[] = [
    { role: 'user',      content: userRequest, timestamp: new Date().toISOString() },
    { role: 'assistant', content: finalText, toolsUsed: allToolsUsed,
      quotation: quotation || undefined,  timestamp: new Date().toISOString() },
  ];

  return {
    quotation:   quotation as Quotation | null,
    explanation: finalText,
    toolsUsed:   allToolsUsed,
    messages:    agentMessages,
  };
}

/**
 * chatQuotation — Multi-turn: maintains conversation session.
 * User can refine: "make it 8mm instead", "add delivery charge", "save it".
 *
 * @example
 * const session = createSession('Glassco');
 * let result = await chatQuotation('I need 5 pieces 6mm plain for Zain Interiors', session);
 * result = await chatQuotation('Make them tempered and add PKR 3000 delivery', session);
 * result = await chatQuotation('Save the quotation', session);
 */
export async function chatQuotation(
  userMessage: string,
  session:     QuotationAgentSession,
): Promise<QuotationAgentResult & { updatedSession: QuotationAgentSession }> {
  // Append user message to session history
  session.history.push({ role: 'user', content: userMessage });

  const { finalText, allToolsUsed, finalMessages } = await agenticLoop(
    session.history,
    session.company,
  );

  // Check if save_quotation was called
  const savedId = allToolsUsed.includes('save_quotation')
    ? (() => {
        // Find the tool result content to extract the ID
        const toolResultMsg = finalMessages.find(
          m => m.role === 'user' &&
               Array.isArray(m.content) &&
               (m.content as ContentBlock[]).some(b => b.type === 'tool_result'),
        );
        if (!toolResultMsg) return undefined;
        const resultBlock = (toolResultMsg.content as ContentBlock[]).find(
          b => b.type === 'tool_result',
        );
        try {
          const parsed = JSON.parse(resultBlock?.content || '{}');
          return parsed.quotationId;
        } catch { return undefined; }
      })()
    : undefined;

  const quotation = extractQuotation(finalText);

  // Update session history with assistant response
  const updatedSession: QuotationAgentSession = {
    ...session,
    history: finalMessages,
  };

  const agentMessages: QuotationAgentMessage[] = [
    { role: 'user',      content: userMessage, timestamp: new Date().toISOString() },
    { role: 'assistant', content: finalText, toolsUsed: allToolsUsed,
      quotation: quotation || undefined, timestamp: new Date().toISOString() },
  ];

  return {
    quotation:      quotation as Quotation | null,
    explanation:    finalText,
    toolsUsed:      allToolsUsed,
    savedId,
    messages:       agentMessages,
    updatedSession,
  };
}

/**
 * createSession — Initialize a new multi-turn session.
 */
export function createSession(company: Company): QuotationAgentSession {
  return { history: [], company };
}
