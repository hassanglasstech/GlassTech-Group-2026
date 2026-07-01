import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import { TagService, TAG_COLORS } from '../services/tagService';
import { TagMaster, Department, TagCategory } from '../types/hr';
import { TagPill } from '../components/TagPills';
import { Plus, Edit2, Trash2, X, Tags, Building2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';
import { EmptyState } from '@/modules/shared/components/EmptyState';

// ── Tag Manager Page ────────────────────────────────────────────────
const TagManager: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeSection, setActiveSection] = useState<'tags' | 'departments'>('tags');
  const [tags, setTags] = useState<TagMaster[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagMaster | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form state
  const [tagForm, setTagForm] = useState<Partial<TagMaster>>({
    category: 'job_title',
    label: '',
    color: TAG_COLORS.job_title.bg,
    textColor: TAG_COLORS.job_title.text,
    isActive: true,
  });

  const [deptForm, setDeptForm] = useState<Partial<Department>>({
    name: '',
    parentDept: null,
    isActive: true,
  });


  const { refreshKey } = useRealtimeRefresh(['tag_master', 'employee_tags', 'departments']);

  useEffect(() => {
    TagService.initSeedData();
    refreshData();
  }, [company, refreshKey]);

  const refreshData = () => {
    setTags(TagService.getTags(company));
    setDepartments(TagService.getDepartments(company));
  };

  // ── Tag CRUD ──────────────────────────────────────────────────────
  const openNewTag = (category: TagCategory) => {
    setEditingTag(null);
    setTagForm({
      category,
      label: '',
      color: TAG_COLORS[category].bg,
      textColor: TAG_COLORS[category].text,
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditTag = (tag: TagMaster) => {
    setEditingTag(tag);
    setTagForm(tag);
    setIsModalOpen(true);
  };

  const saveTag = () => {
    if (!tagForm.label?.trim()) {
      toast.error('Tag label is required');
      return;
    }

    const tag: TagMaster = {
      id: editingTag?.id || `tag_${Date.now()}`,
      company,
      category: tagForm.category || 'job_title',
      label: tagForm.label!.trim(),
      color: tagForm.color || TAG_COLORS.job_title.bg,
      textColor: tagForm.textColor || TAG_COLORS.job_title.text,
      isActive: true,
    };

    TagService.saveTag(tag);
    refreshData();
    setIsModalOpen(false);
    toast.success(`Tag "${tag.label}" saved`);
  };

  const deleteTag = async (id: string) => {
    if (!await confirmModal('Delete this tag? It will be removed from all employees.')) return;
    TagService.deleteTag(id);
    refreshData();
    toast.success('Tag deleted');
  };

  // ── Department CRUD ───────────────────────────────────────────────
  const openNewDept = () => {
    setEditingDept(null);
    setDeptForm({ name: '', parentDept: null, isActive: true });
    setIsDeptModalOpen(true);
  };

  const openEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptForm(dept);
    setIsDeptModalOpen(true);
  };

  const saveDept = () => {
    if (!deptForm.name?.trim()) {
      toast.error('Department name is required');
      return;
    }

    const dept: Department = {
      id: editingDept?.id || `dept_${Date.now()}`,
      company,
      name: deptForm.name!.trim(),
      parentDept: deptForm.parentDept || null,
      isActive: true,
    };

    TagService.saveDepartment(dept);
    refreshData();
    setIsDeptModalOpen(false);
    toast.success(`Department "${dept.name}" saved`);
  };

  const deleteDept = async (id: string) => {
    if (!await confirmModal('Delete this department?')) return;
    TagService.deleteDepartment(id);
    refreshData();
    toast.success('Department deleted');
  };

  // ── Migration ─────────────────────────────────────────────────────
  const runMigration = () => {
    const count = TagService.migrateDesignationToTags(company);
    refreshData();
    toast.success(`${count} employees migrated to tag system`);
  };

  // ── Group tags by category ────────────────────────────────────────
  const jobTitleTags = tags.filter(t => t.category === 'job_title');
  const designationTags = tags.filter(t => t.category === 'designation');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-5 rounded-card border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-6">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">Tag & Department Manager</h3>
            <p className="text-2xs text-slate-400 uppercase font-bold tracking-widest mt-1.5">{company} Configuration</p>
          </div>
          <div className="h-8 w-px bg-slate-100"></div>
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setActiveSection('tags')} className={`px-4 py-2 rounded-lg text-2xs font-black uppercase transition-all ${activeSection === 'tags' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              <Tags size={14} className="inline mr-1" />Tags
            </button>
            <button onClick={() => setActiveSection('departments')} className={`px-4 py-2 rounded-lg text-2xs font-black uppercase transition-all ${activeSection === 'departments' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              <Building2 size={14} className="inline mr-1" />Departments
            </button>
          </div>
        </div>
        <div className="flex space-x-3">
          <button onClick={runMigration} className="bg-amber-50 text-amber-700 px-4 py-2.5 rounded-xl flex items-center space-x-2 font-bold text-sm border border-amber-100 hover:bg-amber-100 transition-all">
            <span>Migrate Legacy</span>
          </button>
        </div>
      </div>

      {activeSection === 'tags' && (
        <>
          {/* Job Title Tags */}
          <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TAG_COLORS.job_title.text }}></div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Job titles</h4>
                <span className="text-2xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{jobTitleTags.length}</span>
              </div>
              <button onClick={() => openNewTag('job_title')} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl flex items-center space-x-2 font-bold text-xs border border-blue-100 hover:bg-blue-100 transition-all">
                <Plus size={14} /><span>Add Job Title</span>
              </button>
            </div>
            {jobTitleTags.length === 0 ? (
              <EmptyState
                compact
                icon={<Tags size={22} />}
                title="No job titles yet"
                description="Add job title tags to label employees in this company."
                action={{ label: 'Add Job Title', icon: <Plus size={14} />, onClick: () => openNewTag('job_title') }}
              />
            ) : (
              <div className="p-6 flex flex-wrap gap-2">
                {jobTitleTags.map(tag => (
                  <div key={tag.id} className="group flex items-center gap-1">
                    <TagPill tag={tag} size="md" />
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button onClick={() => openEditTag(tag)} className="p-1 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 size={12} /></button>
                      <button onClick={() => deleteTag(tag.id)} className="p-1 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Designation Tags */}
          <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TAG_COLORS.designation.text }}></div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Designations</h4>
                <span className="text-2xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{designationTags.length}</span>
              </div>
              <button onClick={() => openNewTag('designation')} className="bg-purple-50 text-purple-700 px-4 py-2 rounded-xl flex items-center space-x-2 font-bold text-xs border border-purple-100 hover:bg-purple-100 transition-all">
                <Plus size={14} /><span>Add Designation</span>
              </button>
            </div>
            {designationTags.length === 0 ? (
              <EmptyState
                compact
                icon={<Tags size={22} />}
                title="No designations yet"
                description="Add designation tags to classify employee roles in this company."
                action={{ label: 'Add Designation', icon: <Plus size={14} />, onClick: () => openNewTag('designation') }}
              />
            ) : (
              <div className="p-6 flex flex-wrap gap-2">
                {designationTags.map(tag => (
                  <div key={tag.id} className="group flex items-center gap-1">
                    <TagPill tag={tag} size="md" />
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button onClick={() => openEditTag(tag)} className="p-1 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 size={12} /></button>
                      <button onClick={() => deleteTag(tag.id)} className="p-1 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeSection === 'departments' && (
        <div className="bg-white rounded-card border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Departments for {company}</h4>
            <button onClick={openNewDept} className="bg-slate-900 text-white px-4 py-2 rounded-xl flex items-center space-x-2 font-bold text-xs hover:bg-slate-800 transition-all">
              <Plus size={14} /><span>Add Department</span>
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {departments.map(dept => (
              <div key={dept.id} className="px-6 py-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-center space-x-3">
                  <Building2 size={16} className="text-slate-400" />
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{dept.name}</p>
                    {dept.parentDept && (
                      <p className="text-2xs text-slate-400 font-bold uppercase">
                        Sub of: {departments.find(d => d.id === dept.parentDept)?.name || dept.parentDept}
                      </p>
                    )}
                  </div>
                </div>
                <div className="hidden group-hover:flex items-center space-x-2">
                  <button onClick={() => openEditDept(dept)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={14} /></button>
                  <button onClick={() => deleteDept(dept.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {departments.length === 0 && (
              <EmptyState
                compact
                icon={<Building2 size={22} />}
                title="No departments configured"
                description={`Set up departments for ${company} to organize employees.`}
                action={{ label: 'Add Department', icon: <Plus size={14} />, onClick: openNewDept }}
              />
            )}
          </div>
        </div>
      )}

      {/* Tag Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-modal">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black uppercase">{editingTag ? 'Edit Tag' : 'New Tag'}</h3>
                <p className="text-2xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {tagForm.category === 'job_title' ? 'Job Title' : 'Designation'} for {company}
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6 bg-slate-50">
              <div className="space-y-1.5">
                <label className="text-2xs font-black text-slate-500 uppercase tracking-widest ml-1">Label</label>
                <input
                  type="text"
                  placeholder={tagForm.category === 'job_title' ? 'e.g. Senior Fabricator' : 'e.g. Supervisor'}
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={tagForm.label || ''}
                  onChange={e => setTagForm({ ...tagForm, label: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-2xs font-black text-slate-500 uppercase tracking-widest ml-1">Preview</label>
                <div className="p-4 bg-white rounded-xl border border-slate-200 flex items-center space-x-3">
                  {tagForm.label ? (
                    <span
                      className="px-3 py-1.5 rounded-full text-label font-bold"
                      style={{ backgroundColor: tagForm.color, color: tagForm.textColor }}
                    >
                      {tagForm.label}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Type a label to preview</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-2xs font-black text-slate-500 uppercase tracking-widest ml-1">Pill Color</label>
                  <input
                    type="color"
                    value={tagForm.color || '#E6F1FB'}
                    onChange={e => setTagForm({ ...tagForm, color: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-2xs font-black text-slate-500 uppercase tracking-widest ml-1">Text Color</label>
                  <input
                    type="color"
                    value={tagForm.textColor || '#0C447C'}
                    onChange={e => setTagForm({ ...tagForm, textColor: e.target.value })}
                    className="w-full h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
            </div>
            <div className="px-8 py-6 bg-white border-t flex justify-end space-x-4">
              <button onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-slate-800">Cancel</button>
              <button onClick={saveTag} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 transition-all flex items-center space-x-2">
                <Save size={16} /><span>Save Tag</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-modal">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-8 py-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-lg font-black uppercase">{editingDept ? 'Edit Department' : 'New Department'}</h3>
              <button onClick={() => setIsDeptModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6 bg-slate-50">
              <div className="space-y-1.5">
                <label className="text-2xs font-black text-slate-500 uppercase tracking-widest ml-1">Department Name</label>
                <input
                  type="text"
                  placeholder="e.g. Fabrication"
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={deptForm.name || ''}
                  onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-2xs font-black text-slate-500 uppercase tracking-widest ml-1">Parent Department (optional)</label>
                <select
                  className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none font-bold text-slate-900"
                  value={deptForm.parentDept || ''}
                  onChange={e => setDeptForm({ ...deptForm, parentDept: e.target.value || null })}
                >
                  <option value="">-- None (Top Level) --</option>
                  {departments.filter(d => d.id !== editingDept?.id).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-8 py-6 bg-white border-t flex justify-end space-x-4">
              <button onClick={() => setIsDeptModalOpen(false)} className="px-6 py-3 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-slate-800">Cancel</button>
              <button onClick={saveDept} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 transition-all flex items-center space-x-2">
                <Save size={16} /><span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(TagManager);
