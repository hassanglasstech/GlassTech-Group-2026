/**
 * projectService.ts — Phase 9
 * Supabase-primary project service with GL cost linking and milestones.
 */

import { Project } from '../../shared/types';
import { Company } from '../../shared/types/core';
import { safeParse, safeSave } from '../../shared/services/utils';
import { supabase } from '@/src/services/supabaseClient';
import { Logger } from '@/modules/shared/services/logger';
import { FinanceService } from '@/modules/finance/services/financeService';
import { toast } from 'sonner';

const KEY = 'gtk_erp_projects';

let _cache: Project[] | null = null;

const _push = async (data: Project[]): Promise<void> => {
  try {
    const rows = data.map(p => ({ id: p.id, company: p.company, data: p, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('projects').upsert(rows);
    if (error) Logger.warn('Projects', 'Supabase upsert failed', error);
  } catch (e) { Logger.warn('Projects', 'Supabase push failed', e); }
};

export const ProjectService = {

  getProjects: (): Project[] => {
    if (_cache) return _cache;
    return safeParse(KEY);
  },

  saveProjects: (data: Project[]): void => {
    _cache = data;
    safeSave(KEY, data);
    _push(data);
  },

  loadFromSupabase: async (): Promise<void> => {
    try {
      const { data } = await supabase.from('projects').select('data').order('updated_at', { ascending: false });
      if (data?.length) {
        const projects = data.map((r: { data: Project }) => r.data as Project).filter(Boolean);
        _cache = projects;
        safeSave(KEY, projects);
      } else {
        _cache = safeParse(KEY);
      }
    } catch { _cache = safeParse(KEY); }
  },

  addMilestone: (projectId: string, milestone: { event: string; type: 'info' | 'alert' | 'success' }): void => {
    const all = ProjectService.getProjects();
    const idx = all.findIndex(p => p.id === projectId);
    if (idx === -1) return;
    all[idx] = { ...all[idx], timeline: [...(all[idx].timeline || []), { date: new Date().toISOString().split('T')[0], ...milestone }] };
    ProjectService.saveProjects(all);
  },

  postProjectCost: (params: {
    projectId: string; company: Company;
    costType: 'Glass' | 'Aluminium' | 'Hardware' | 'Installation' | 'Other';
    amount: number; description: string; referenceId?: string;
  }): void => {
    const { projectId, company, costType, amount, description, referenceId } = params;
    const wipAcc = FinanceService.ensureAccount(company, 'PROJECT WIP',      3, null, 'Asset',    'PROJ-WIP');
    const apAcc  = FinanceService.ensureAccount(company, 'Project Accruals', 3, null, 'Liability','PROJ-AP');
    FinanceService.recordTransaction({
      id: `PROJ-${projectId}-${Date.now()}`, company, docType: 'JV',
      docDate: new Date().toISOString().split('T')[0],
      date:    new Date().toISOString().split('T')[0],
      description: `PROJECT COST: ${costType} — ${description}`.toUpperCase(),
      referenceId: referenceId || projectId, status: 'Posted',
      details: [
        { accountId: wipAcc.id, debit: amount, credit: 0,      text: `${costType} — ${description}` },
        { accountId: apAcc.id,  debit: 0,      credit: amount, text: 'Project cost accrual' },
      ],
    });
    const all = ProjectService.getProjects();
    const idx = all.findIndex(p => p.id === projectId);
    if (idx !== -1) {
      const p = { ...all[idx] };
      if (costType === 'Glass')        p.glassConsumed       = (p.glassConsumed    || 0) + amount;
      else if (costType === 'Aluminium') p.aluminiumConsumed = (p.aluminiumConsumed|| 0) + amount;
      else if (costType === 'Hardware')  p.hardwareConsumed  = (p.hardwareConsumed || 0) + amount;
      else                               p.otherConsumed     = (p.otherConsumed    || 0) + amount;
      p.timeline = [...(p.timeline || []), { date: new Date().toISOString().split('T')[0], event: `${costType} PKR ${amount.toLocaleString()} — ${description}`, type: 'info' as const }];
      all[idx] = p;
      ProjectService.saveProjects(all);
    }
    toast.success(`Project cost posted: ${costType} PKR ${amount.toLocaleString()}`);
  },

  linkJobOrder: (projectId: string, jobOrderId: string): void => {
    ProjectService.addMilestone(projectId, { event: `Job Order ${jobOrderId} linked`, type: 'success' });
    toast.success(`Job Order ${jobOrderId} linked to project.`);
  },

  completeProject: (projectId: string, company: Company, finalValue?: number): void => {
    const all = ProjectService.getProjects();
    const idx = all.findIndex(p => p.id === projectId);
    if (idx === -1) return;
    const p = all[idx];
    const rev = finalValue ?? p.value;
    all[idx] = {
      ...p, status: 'Completed', finalSettlementValue: rev,
      timeline: [...(p.timeline || []), { date: new Date().toISOString().split('T')[0], event: `Completed. Final: PKR ${rev.toLocaleString()}`, type: 'success' as const }],
    };
    ProjectService.saveProjects(all);
    const arAcc  = FinanceService.ensureAccount(company, 'PROJECT RECEIVABLE', 4, null, 'Asset',  'PROJ-AR');
    const revAcc = FinanceService.ensureAccount(company, 'PROJECT REVENUE',    4, null, 'Revenue','PROJ-REV');
    FinanceService.recordTransaction({
      id: `PROJ-COMP-${projectId}`, company, docType: 'DR',
      docDate: new Date().toISOString().split('T')[0],
      date:    new Date().toISOString().split('T')[0],
      description: `PROJECT COMPLETION: ${p.title}`.toUpperCase(),
      referenceId: projectId, status: 'Posted',
      details: [
        { accountId: arAcc.id,  debit: rev, credit: 0,   text: `Project AR: ${p.title}` },
        { accountId: revAcc.id, debit: 0,   credit: rev, text: `Project Revenue: ${p.title}` },
      ],
    });
    toast.success(`Project completed — Revenue GL posted: PKR ${rev.toLocaleString()}`);
  },
};
