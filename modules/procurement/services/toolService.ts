/**
 * toolService.ts — Session 6
 * Shared tool storage + auto-register from GRN
 * Used by: GTKStoreReceipt (auto-register on GRN), ToolRegister (CRUD + UI)
 */

import { safeParse, safeSave } from '@/modules/shared/services/utils';

// ═══════════════════════════════════════════════════════════════════════
//  TYPES (exported for both consumers)
// ═══════════════════════════════════════════════════════════════════════

export type ToolCategory = 'Hand Tool' | 'Power Tool' | 'Measuring' | 'Cutting' | 'Safety' | 'Installer Kit';
export type ToolStatus = 'Available' | 'Assigned' | 'Maintenance' | 'Lost' | 'Damaged' | 'Written Off';
export type ToolCondition = 'New' | 'Good' | 'Fair' | 'Poor' | 'Broken';

export interface ToolHistoryEntry {
  date: string;
  action: 'Registered' | 'Assigned' | 'Returned' | 'Maintenance' | 'Condition Update' | 'Written Off' | 'Auto-Registered via GRN';
  details: string;
  by: string;
}

export interface Tool {
  id: string;
  company: string;
  name: string;
  category: ToolCategory;
  brand?: string;
  model?: string;
  purchaseDate: string;
  purchaseCost: number;
  currentCondition: ToolCondition;
  status: ToolStatus;
  storageBin: string;
  assignedTo?: string;
  assignedDate?: string;
  assignedProject?: string;
  history: ToolHistoryEntry[];
  writeOffDate?: string;
  writeOffReason?: string;
  writeOffGlId?: string;
  // ── GRN linkage (Session 6) ────────────────────────────────────
  grnId?: string;          // which GRN created this tool
  reqId?: string;          // which requisition was linked
}

// ═══════════════════════════════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════════════════════════════

const TOOLS_KEY = 'gtk_erp_tools';

export const ToolService = {
  getTools: (): Tool[] => safeParse(TOOLS_KEY),
  saveTools: (data: Tool[]) => safeSave(TOOLS_KEY, data),

  // ── Get next sequential ID ──────────────────────────────────────
  nextId: (company: string): string => {
    const all = ToolService.getTools().filter(t => t.company === company);
    const seqNo = String(all.length + 1).padStart(3, '0');
    return `TOOL-${company.slice(0, 3)}-${seqNo}`;
  },

  // ── Auto-register tools from GRN ────────────────────────────────
  //    Called by GTKStoreReceipt.handlePost() when tool lines detected
  autoRegisterFromGRN: (params: {
    company: string;
    lines: {
      description: string;
      qty: number;
      rate: number;
      category?: string;
      materialType?: string;
    }[];
    grnId: string;
    reqId?: string;
    receivedBy: string;
    purchaseDate: string;
  }): { registered: number; toolIds: string[] } => {
    const { company, lines, grnId, reqId, receivedBy, purchaseDate } = params;
    const all = ToolService.getTools();
    const existingCount = all.filter(t => t.company === company).length;
    const newTools: Tool[] = [];
    let seq = existingCount;

    for (const line of lines) {
      // Detect tool category from description
      const toolCategory = guessToolCategory(line.description);

      for (let i = 0; i < line.qty; i++) {
        seq++;
        const toolId = `TOOL-${company.slice(0, 3)}-${String(seq).padStart(3, '0')}`;

        newTools.push({
          id: toolId,
          company,
          name: line.description.toUpperCase(),
          category: toolCategory,
          purchaseDate,
          purchaseCost: line.rate,
          currentCondition: 'New',
          status: 'Available',
          storageBin: 'GTK-TOOL-STORE',
          grnId,
          reqId,
          history: [{
            date: new Date().toISOString(),
            action: 'Auto-Registered via GRN',
            details: `Auto-registered from GRN ${grnId}${reqId ? ` (Req: ${reqId})` : ''}. Cost: PKR ${line.rate}. Received by: ${receivedBy}`,
            by: receivedBy || 'System',
          }],
        });
      }
    }

    if (newTools.length > 0) {
      ToolService.saveTools([...all, ...newTools]);
    }

    return {
      registered: newTools.length,
      toolIds: newTools.map(t => t.id),
    };
  },
};

// ── Helper: guess tool category from description ──────────────────────
function guessToolCategory(desc: string): ToolCategory {
  const d = desc.toUpperCase();

  // Power tools
  if (d.includes('GRINDER') || d.includes('DRILL') || d.includes('SAW') ||
      d.includes('CUTTER') || d.includes('MACHINE') || d.includes('JIGSAW') ||
      d.includes('ROUTER') || d.includes('SANDER') || d.includes('COMPRESSOR'))
    return 'Power Tool';

  // Cutting tools
  if (d.includes('BLADE') || d.includes('BIT') || d.includes('DISC') ||
      d.includes('HACKSAW'))
    return 'Cutting';

  // Measuring
  if (d.includes('TAPE') || d.includes('LEVEL') || d.includes('SQUARE') ||
      d.includes('MEASURE') || d.includes('RULER') || d.includes('CALIPER'))
    return 'Measuring';

  // Safety
  if (d.includes('GLOVE') || d.includes('GOGGLE') || d.includes('HELMET') ||
      d.includes('MASK') || d.includes('SAFETY') || d.includes('HARNESS'))
    return 'Safety';

  // Installer Kit
  if (d.includes('KIT') || d.includes('TOOLBOX') || d.includes('SET'))
    return 'Installer Kit';

  return 'Hand Tool';
}
