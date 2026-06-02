// ═══════════════════════════════════════════════════════════════════
// E2E Agent Service — Chat se "req banao + verify karo" type requests
// handle karta hai. Agent record khud create karta hai phir sab
// locations verify karke human-readable result chat mein deta hai.
// ═══════════════════════════════════════════════════════════════════

import { runVerification, TEST_RECIPES, type VerifyLocation, type VerifyResult, type CreatedRecord } from './e2eVerifierService';

// ── Detection ─────────────────────────────────────────────────────
export function isE2EAgentRequest(message: string): boolean {
  const lower = message.toLowerCase();

  const createWords  = ['banao', 'bna', 'bnao', 'bnana', 'create', 'dal do', 'daalo', 'enter karo', 'add karo', 'enter krdo'];
  const docWords     = ['req', 'requisition', 'loan', 'quotation', 'quo', 'invoice', 'inv', 'jv', 'journal', 'grn', 'payroll', 'attendance', 'salary'];
  const verifyWords  = ['verify', 'check', 'dekho', 'dekh lo', 'check karo', 'confirm', 'test karo', 'verify karo', 'check krna', 'till the last', 'sari jagah', 'downstream'];

  const hasCreate = createWords.some(k => lower.includes(k));
  const hasDoc    = docWords.some(k => lower.includes(k));
  const hasVerify = verifyWords.some(k => lower.includes(k));

  // Either: create + doc, or verify + doc, or all three
  return hasDoc && (hasCreate || hasVerify);
}

// ── Recipe Detection ──────────────────────────────────────────────
function detectRecipe(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('loan'))                                  return 'E2E-LOAN';
  if (lower.includes('grn') || lower.includes('stock') || lower.includes('material')) return 'E2E-GRN';
  if (lower.includes('payroll') || lower.includes('salary') || lower.includes('attendance')) return 'E2E-PAY';
  if (lower.includes('jv') || lower.includes('journal voucher') || lower.includes('journal entry')) return 'E2E-JV';
  if (lower.includes('invoice') || lower.includes(' inv '))    return 'E2E-INV';
  if (lower.includes('quotation') || lower.includes(' quo ') || lower.includes('order')) return 'E2E-QUO';
  if (lower.includes('req') || lower.includes('requisition'))  return 'E2E-REQ';
  return 'E2E-REQ';
}

// ── Input Extraction from Natural Language ────────────────────────
function extractInputs(message: string, recipeId: string): Record<string, any> {
  const lower = message.toLowerCase();

  // Company
  let company = 'Glassco';
  if (lower.includes('gtk'))     company = 'GTK';
  else if (lower.includes('gti')) company = 'GTI';
  else if (lower.includes('nippon')) company = 'Nippon';
  else if (lower.includes('glassco')) company = 'Glassco';

  // Amount — match "50000", "50,000", "PKR 50000", "50k"
  let amount = 50000;
  const amtK = message.match(/(\d+)\s*k\b/i);
  const amtRaw = message.match(/(?:pkr|rs\.?|rupees?)?\s*(\d[\d,]+)/i);
  if (amtK) {
    amount = parseInt(amtK[1], 10) * 1000;
  } else if (amtRaw) {
    const parsed = parseInt(amtRaw[1].replace(/,/g, ''), 10);
    if (parsed >= 100) amount = parsed; // ignore small numbers like year mentions
  }

  // Employee ID — 13-digit CNIC
  let emp_id = 'E2E-EMP-001';
  const empMatch = message.match(/\b(\d{13})\b/);
  if (empMatch) emp_id = empMatch[1];

  // Month — YYYY-MM or "April 2026" style
  let month = new Date().toISOString().slice(0, 7);
  const monthMatch = message.match(/(\d{4}-\d{2})/);
  if (monthMatch) month = monthMatch[1];

  // Category
  let category = 'HR';
  if (lower.includes('store') || lower.includes('material') || lower.includes('purchase')) category = 'Store Purchase';
  else if (lower.includes('admin')) category = 'Admin';
  else if (lower.includes('production') || lower.includes('prod')) category = 'Production';
  else if (lower.includes('r&m') || lower.includes('repair')) category = 'R&M';

  // Item name for GRN
  let item_name = 'Float Glass 5mm';
  const glassMatch = message.match(/(\d+mm|float glass|clear glass|tinted|reflective)\s*\w*/i);
  if (glassMatch) item_name = glassMatch[0].trim();

  switch (recipeId) {
    case 'E2E-LOAN': return { company, emp_id, amount };
    case 'E2E-REQ':  return { company, category, amount, requisitioner: 'E2E Agent' };
    case 'E2E-QUO':  return { company, client: 'E2E Test Client', amount };
    case 'E2E-PAY':  return { company, emp_id, month, gross: amount < 5000 ? 30000 : amount };
    case 'E2E-JV':   return { company, amount, maker: 'agent@glasstech.pk' };
    case 'E2E-GRN':  return { company, item_name, qty: 100, price: Math.max(100, Math.round(amount / 100)) };
    case 'E2E-INV':  return { company, client: 'E2E Test Client', amount };
    default:         return { company, amount };
  }
}

// ── Format chat response ──────────────────────────────────────────
function formatChatResponse(
  created: CreatedRecord,
  locations: VerifyLocation[],
  result: VerifyResult,
  recipeName: string,
): string {
  const icon = result.status === 'pass' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';

  let msg = `**Agent ne ${recipeName} execute kiya:**\n\n`;
  msg += `📄 **${result.createdId}**\n`;
  msg += `${created.summary}\n\n`;
  msg += `---\n`;
  msg += `**Location Verification — ${result.passedLocations}/${result.totalLocations} verified:**\n\n`;

  locations.forEach(loc => {
    const allPass  = loc.found && loc.fields.every(f => f.match);
    const locIcon  = allPass ? '✅' : loc.found ? '⚠️' : '❌';
    const locLabel = allPass ? 'VERIFIED' : loc.found ? 'PARTIAL' : 'NOT FOUND';

    msg += `${locIcon} **${loc.name}** — ${locLabel}`;
    if (loc.latencyMs > 0) msg += ` _(${loc.latencyMs}ms)_`;
    msg += `\n`;

    // Show failing fields only
    const failing = loc.fields.filter(f => !f.match);
    if (failing.length > 0 && loc.found) {
      failing.forEach(f => {
        msg += `   ↳ \`${f.field}\`: expected \`${f.expected}\` | got \`${f.actual}\`\n`;
      });
    }
    if (!loc.found) {
      msg += `   ↳ Record ${result.createdId} is haqs mein nahi mila\n`;
    }
  });

  msg += `\n---\n`;
  if (result.status === 'pass') {
    msg += `${icon} **Han bilkul sahi — sari ${result.totalLocations} locations mein data correctly pahuncha** ✓`;
  } else if (result.status === 'partial') {
    msg += `${icon} **Partial — ${result.passedLocations} verified, ${result.failedLocations} locations mein data nahi mila**\n`;
    msg += `_(Supabase sync mein thodi der lag sakti hai — thodi der baad dobara try karo)_`;
  } else {
    msg += `${icon} **Failed — Data kisi bhi location mein nahi mila**`;
  }

  msg += `\n\n_Total time: ${result.duration}ms_`;
  return msg;
}

// ── Main entry point — chat se call hota hai ──────────────────────
export async function runE2EAgentFlow(message: string): Promise<string> {
  const recipeId = detectRecipe(message);
  const recipe   = TEST_RECIPES.find(r => r.id === recipeId);
  if (!recipe) return `Recipe "${recipeId}" nahi mila.`;

  const inputs = extractInputs(message, recipeId);

  let createdRecord: CreatedRecord | null = null;
  const locations: VerifyLocation[] = [];

  try {
    const result = await runVerification(
      recipeId,
      inputs,
      (loc) => locations.push(loc),
      true, // autoCreate = true
      (rec) => { createdRecord = rec; },
    );

    if (!createdRecord) {
      return `Record create nahi ho saka. Inputs check karo: ${JSON.stringify(inputs)}`;
    }

    return formatChatResponse(createdRecord, locations, result, recipe.name);
  } catch (err: any) {
    return `E2E flow mein error: ${err?.message || String(err)}`;
  }
}
