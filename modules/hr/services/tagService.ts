import { TagMaster, EmployeeTag, Department, TagCategory } from '../types/hr';
import { Company } from '@/modules/shared/types/core';
import { safeParse, safeSave } from '../../shared/services/utils';
import { SyncService } from '@/src/services/SyncService';
import { Logger } from '@/modules/shared/services/logger';

// ── Storage Keys ────────────────────────────────────────────────────
const KEYS = {
  TAG_MASTER:    'gtk_erp_tag_master',
  EMPLOYEE_TAGS: 'gtk_erp_employee_tags',
  DEPARTMENTS:   'gtk_erp_departments',
};

// ── Default Color Palette ───────────────────────────────────────────
export const TAG_COLORS: Record<TagCategory, { bg: string; text: string }> = {
  job_title:   { bg: '#E6F1FB', text: '#0C447C' },   // Blue pills
  designation: { bg: '#EEEDFE', text: '#3C3489' },   // Purple pills
};

// ── Seed Data ───────────────────────────────────────────────────────
const SEED_DEPARTMENTS: Omit<Department, 'id'>[] = [
  { company: 'Glassco', name: 'Glass Cutting', parentDept: null, isActive: true },
  { company: 'Glassco', name: 'Processing', parentDept: null, isActive: true },
  { company: 'Glassco', name: 'Quality & Finishing', parentDept: null, isActive: true },
  { company: 'Glassco', name: 'Store', parentDept: null, isActive: true },
  { company: 'Glassco', name: 'Administration', parentDept: null, isActive: true },
];

const SEED_TAGS: Omit<TagMaster, 'id'>[] = [
  // ── Glassco Job Titles ──
  { company: 'Glassco', category: 'job_title', label: 'Senior Cutter', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Cutter', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Helper', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Hole Punch Operator', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Polishing Operator', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Edging Operator', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'QC Inspector', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Tempering Operator', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Packing Operator', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  { company: 'Glassco', category: 'job_title', label: 'Store Keeper', color: '#E6F1FB', textColor: '#0C447C', isActive: true },
  // ── Glassco Designations ──
  { company: 'Glassco', category: 'designation', label: 'Supervisor', color: '#EEEDFE', textColor: '#3C3489', isActive: true },
  { company: 'Glassco', category: 'designation', label: 'Shift Incharge', color: '#EEEDFE', textColor: '#3C3489', isActive: true },
  { company: 'Glassco', category: 'designation', label: 'Team Lead', color: '#EEEDFE', textColor: '#3C3489', isActive: true },
  { company: 'Glassco', category: 'designation', label: 'Store Incharge', color: '#EEEDFE', textColor: '#3C3489', isActive: true },
];

// ── Tag Master Service ──────────────────────────────────────────────
export const TagService = {
  // ── Initialize seed data if empty ─────────────────────────────────
  initSeedData: () => {
    const existing = safeParse(KEYS.TAG_MASTER);
    if (!existing || existing.length === 0) {
      const seeded: TagMaster[] = SEED_TAGS.map((t, i) => ({
        ...t,
        id: `tag_${String(i + 1).padStart(3, '0')}`,
      }));
      safeSave(KEYS.TAG_MASTER, seeded);
      Logger.action('Tags', 'SEED', `${seeded.length} tags seeded`);
    }

    const existingDepts = safeParse(KEYS.DEPARTMENTS);
    if (!existingDepts || existingDepts.length === 0) {
      const seeded: Department[] = SEED_DEPARTMENTS.map((d, i) => ({
        ...d,
        id: `dept_${String(i + 1).padStart(3, '0')}`,
      }));
      safeSave(KEYS.DEPARTMENTS, seeded);
      Logger.action('Departments', 'SEED', `${seeded.length} departments seeded`);
    }
  },

  // ── Tag Master CRUD ───────────────────────────────────────────────
  getTags: (company?: Company): TagMaster[] => {
    const all: TagMaster[] = safeParse(KEYS.TAG_MASTER);
    if (company) return all.filter(t => t.company === company && t.isActive);
    return all.filter(t => t.isActive);
  },

  getTagsByCategory: (company: Company, category: TagCategory): TagMaster[] => {
    return TagService.getTags(company).filter(t => t.category === category);
  },

  getTagById: (id: string): TagMaster | undefined => {
    const all: TagMaster[] = safeParse(KEYS.TAG_MASTER);
    return all.find(t => t.id === id);
  },

  saveTag: (tag: TagMaster) => {
    const all: TagMaster[] = safeParse(KEYS.TAG_MASTER);
    const idx = all.findIndex(t => t.id === tag.id);
    if (idx >= 0) {
      all[idx] = tag;
    } else {
      all.push(tag);
    }
    safeSave(KEYS.TAG_MASTER, all);
    SyncService.markDirty('tag_master');
    Logger.action('Tags', 'SAVE', `Tag "${tag.label}" saved`);
  },

  deleteTag: (id: string) => {
    const all: TagMaster[] = safeParse(KEYS.TAG_MASTER);
    const updated = all.map(t => t.id === id ? { ...t, isActive: false } : t);
    safeSave(KEYS.TAG_MASTER, updated);
    // Also remove employee assignments
    const empTags: EmployeeTag[] = safeParse(KEYS.EMPLOYEE_TAGS);
    safeSave(KEYS.EMPLOYEE_TAGS, empTags.filter(et => et.tagId !== id));
    SyncService.markDirty('tag_master');
    SyncService.markDirty('employee_tags');
    Logger.action('Tags', 'DELETE', `Tag ${id} soft-deleted`);
  },

  // ── Employee Tag Assignments ──────────────────────────────────────
  getEmployeeTags: (employeeId: string): EmployeeTag[] => {
    const all: EmployeeTag[] = safeParse(KEYS.EMPLOYEE_TAGS);
    return all.filter(et => et.employeeId === employeeId);
  },

  getEmployeeTagsResolved: (employeeId: string): (EmployeeTag & { tag: TagMaster })[] => {
    const empTags = TagService.getEmployeeTags(employeeId);
    const allTags: TagMaster[] = safeParse(KEYS.TAG_MASTER);
    return empTags
      .map(et => {
        const tag = allTags.find(t => t.id === et.tagId);
        return tag ? { ...et, tag } : null;
      })
      .filter(Boolean) as (EmployeeTag & { tag: TagMaster })[];
  },

  setEmployeeTags: (employeeId: string, tagIds: string[], primaryTagId?: string) => {
    const all: EmployeeTag[] = safeParse(KEYS.EMPLOYEE_TAGS);
    // Remove existing tags for this employee
    const others = all.filter(et => et.employeeId !== employeeId);
    // Add new tags
    const newTags: EmployeeTag[] = tagIds.map((tagId, i) => ({
      id: `et_${employeeId}_${tagId}`,
      employeeId,
      tagId,
      isPrimary: primaryTagId ? tagId === primaryTagId : i === 0,
    }));
    safeSave(KEYS.EMPLOYEE_TAGS, [...others, ...newTags]);
    SyncService.markDirty('employee_tags');
    Logger.action('Tags', 'ASSIGN', `${tagIds.length} tags assigned to ${employeeId}`);
  },

  addEmployeeTag: (employeeId: string, tagId: string, isPrimary = false) => {
    const all: EmployeeTag[] = safeParse(KEYS.EMPLOYEE_TAGS);
    // Check duplicate
    if (all.some(et => et.employeeId === employeeId && et.tagId === tagId)) return;
    const newTag: EmployeeTag = {
      id: `et_${employeeId}_${tagId}`,
      employeeId,
      tagId,
      isPrimary,
    };
    safeSave(KEYS.EMPLOYEE_TAGS, [...all, newTag]);
    SyncService.markDirty('employee_tags');
  },

  removeEmployeeTag: (employeeId: string, tagId: string) => {
    const all: EmployeeTag[] = safeParse(KEYS.EMPLOYEE_TAGS);
    safeSave(KEYS.EMPLOYEE_TAGS, all.filter(et => !(et.employeeId === employeeId && et.tagId === tagId)));
    SyncService.markDirty('employee_tags');
  },

  // ── Department CRUD ───────────────────────────────────────────────
  getDepartments: (company?: Company): Department[] => {
    const all: Department[] = safeParse(KEYS.DEPARTMENTS);
    if (company) return all.filter(d => d.company === company && d.isActive);
    return all.filter(d => d.isActive);
  },

  getDeptById: (id: string): Department | undefined => {
    const all: Department[] = safeParse(KEYS.DEPARTMENTS);
    return all.find(d => d.id === id);
  },

  saveDepartment: (dept: Department) => {
    const all: Department[] = safeParse(KEYS.DEPARTMENTS);
    const idx = all.findIndex(d => d.id === dept.id);
    if (idx >= 0) {
      all[idx] = dept;
    } else {
      all.push(dept);
    }
    safeSave(KEYS.DEPARTMENTS, all);
    SyncService.markDirty('departments');
    Logger.action('Departments', 'SAVE', `Dept "${dept.name}" saved`);
  },

  deleteDepartment: (id: string) => {
    const all: Department[] = safeParse(KEYS.DEPARTMENTS);
    safeSave(KEYS.DEPARTMENTS, all.map(d => d.id === id ? { ...d, isActive: false } : d));
    SyncService.markDirty('departments');
  },

  // ── Migration helper: convert legacy designation string to tags ────
  migrateDesignationToTags: (company: Company) => {
    const employees = safeParse('gtk_erp_employees').filter((e: any) => e?.company === company);
    const tags = TagService.getTags(company);
    const existingEmpTags: EmployeeTag[] = safeParse(KEYS.EMPLOYEE_TAGS);
    const newEmpTags: EmployeeTag[] = [];

    for (const emp of employees) {
      const desig = emp?.work?.designation?.trim();
      if (!desig) continue;
      // Already has tags? skip
      if (existingEmpTags.some(et => et.employeeId === emp.id)) continue;

      // Try to find matching tag
      const match = tags.find(t => t.label.toLowerCase() === desig.toLowerCase());
      if (match) {
        newEmpTags.push({
          id: `et_${emp.id}_${match.id}`,
          employeeId: emp.id,
          tagId: match.id,
          isPrimary: true,
        });
      }
    }

    if (newEmpTags.length > 0) {
      safeSave(KEYS.EMPLOYEE_TAGS, [...existingEmpTags, ...newEmpTags]);
      SyncService.markDirty('employee_tags');
      Logger.action('Tags', 'MIGRATE', `${newEmpTags.length} employees migrated for ${company}`);
    }

    return newEmpTags.length;
  },
};
