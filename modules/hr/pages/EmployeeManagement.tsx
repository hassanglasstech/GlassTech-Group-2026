
import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { Employee, Account, Company, TagMaster, Department, EmployeeStatus } from '@/modules/shared/types';
import { HRService } from '@/modules/hr/services/hrService';
import { TagService } from '@/modules/hr/services/tagService';
import { EmployeeDocService } from '@/modules/hr/services/employeeDocService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { EmployeeTagPills, TagSelector } from '@/modules/hr/components/TagPills';
import DocumentFolder from '@/modules/hr/components/DocumentFolder';
import DocExpiryAlerts from '@/modules/hr/components/DocExpiryAlerts';
import DisciplinaryManager from './DisciplinaryManager';
import EmployeeProfileCard from '@/modules/hr/components/EmployeeProfileCard';
import { UserPlus, Search, Edit2, Trash2, X, Briefcase, Wallet, UserCircle, FileUp, Download, Building2, Tags, FolderOpen, Eye, EyeOff } from 'lucide-react';
import Pagination from '@/components/Pagination';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/modules/shared/hooks/useRealtimeRefresh';

// ── Status config ───────────────────────────────────────────────────
const STATUS_OPTIONS: { value: EmployeeStatus; label: string; color: string }[] = [
  { value: 'probation',  label: 'Probation',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'confirmed',  label: 'Confirmed',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'resigned',   label: 'Resigned',   color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'terminated', label: 'Terminated',  color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'suspended',  label: 'Suspended',  color: 'bg-orange-100 text-orange-700 border-orange-200' },
];
const INACTIVE_STATUSES: EmployeeStatus[] = ['resigned', 'terminated'];

type ModalTab = 'personal' | 'employment' | 'salary' | 'documents' | 'salaryhistory' | 'disciplinary' | 'transfer';

const EmployeeManagement: React.FC<{ company: Company }> = ({ company }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<ModalTab>('personal');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);

  // ── Tag & Department State ──────────────────────────────────────────
  const [companyTags, setCompanyTags] = useState<TagMaster[]>([]);
  const [companyDepts, setCompanyDepts] = useState<Department[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  
  const initialFormState: Partial<Employee> = {
    company,
    personal: { name: '', cnic: '', phone: '', address: '' },
    work: { designation: '', department: '', departmentId: '', grade: '', joinDate: new Date().toISOString().split('T')[0], employeeCode: '' },
    salary: { basic: 0, houseRent: 0, conveyance: 0, specialAllowance: 0 }
  };

  const [formData, setFormData] = useState<Partial<Employee>>(initialFormState);


  const { refreshKey } = useRealtimeRefresh(['employees', 'departments', 'tag_master', 'employee_tags']);

  useEffect(() => {
    TagService.initSeedData();
    const currentEmployees = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(currentEmployees);
    setCompanyTags(TagService.getTags(company));
    setCompanyDepts(TagService.getDepartments(company));
  }, [company, refreshKey]);

  useEffect(() => {
    if (isModalOpen && !editingId) {
      const currentCompanyEmployees = HRService.getEmployees().filter(e => e.company === company);
      const nextId = currentCompanyEmployees.length + 1;
      const autoCode = `${company}-${nextId.toString().padStart(3, '0')}`;
      setFormData(prev => ({
        ...prev,
        work: { ...prev.work!, employeeCode: autoCode }
      }));
    }
  }, [isModalOpen, company, editingId]);

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[] = XLSX.utils.sheet_to_json(ws);
      const importedEmployees: Employee[] = data.map((row, index) => ({
        id: (Date.now() + index).toString(), company,
        personal: { name: row.Name||'', cnic: row.CNIC||'', phone: row.Phone||'', address: row.Address||'' },
        work: { designation: row.Designation||'', department: row.Department||'', departmentId: '', grade: row.Grade||'', joinDate: row.JoinDate||new Date().toISOString().split('T')[0], employeeCode: row.EmployeeCode||`${company}-${index}` },
        salary: { basic: Number(row.Basic)||0, houseRent: Number(row.HouseRent)||0, conveyance: Number(row.Conveyance)||0, specialAllowance: Number(row.SpecialAllowance)||0 }
      }));
      const all = HRService.getEmployees();
      const updated = [...all, ...importedEmployees];
      HRService.saveEmployees(updated);
      setEmployees(updated.filter(e => e.company === company));
      toast.success(`${importedEmployees.length} employees imported!`);
    };
    reader.readAsBinaryString(file);
  };

  const handleExportExcel = () => {
    const dataToExport = employees.map(emp => {
      const tags = TagService.getEmployeeTagsResolved(emp.id);
      const jobTitles = tags.filter(t => t.tag.category === 'job_title').map(t => t.tag.label).join(', ');
      const designations = tags.filter(t => t.tag.category === 'designation').map(t => t.tag.label).join(', ');
      const dept = TagService.getDeptById(emp.work.departmentId || '');
      const completeness = EmployeeDocService.getCompleteness(emp.id);
      return {
        'Name': emp.personal.name, 'EmployeeCode': emp.work.employeeCode,
        'CNIC': emp.personal.cnic, 'Phone': emp.personal.phone,
        'Job Titles': jobTitles || emp.work.designation,
        'Designations': designations,
        'Department': dept?.name || emp.work.department,
        'JoinDate': emp.work.joinDate,
        'Basic': emp.salary.basic, 'HouseRent': emp.salary.houseRent,
        'Conveyance': emp.salary.conveyance, 'SpecialAllowance': emp.salary.specialAllowance,
        'Doc Completeness': `${completeness}%`,
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, `${company}_Employee_Registry.xlsx`);
  };

  const autoCreateLedgerAccount = (employeeName: string) => {
    const allAccounts = FinanceService.getAccounts();
    const companyAccounts = allAccounts.filter(a => a.company === company);
    const salaryParent = companyAccounts.find(a => 
      a.level === 4 && (a.name.toUpperCase().includes('SALAR') || a.name.toUpperCase().includes('WAGE') || a.name.toUpperCase().includes('PAYROLL'))
    );
    if (salaryParent) {
      const exists = companyAccounts.find(a => a.parentId === salaryParent.id && a.name.toLowerCase() === employeeName.toLowerCase());
      if (!exists) {
        const siblings = companyAccounts.filter(a => a.parentId === salaryParent.id);
        const newCode = `${salaryParent.code}-${(siblings.length + 1).toString().padStart(3, '0')}`;
        const newAccount: Account = { id: `${company}-ACC-EMP-${Date.now()}`, company, code: newCode, name: employeeName, level: 5, parentId: salaryParent.id, type: 'Expense' };
        FinanceService.saveAccounts([...allAccounts, newAccount]);
        return `Linked L5 Account Created: ${newAccount.name} (${newAccount.code})`;
      }
    }
    return null;
  };

  const handleSave = () => {
    if (!formData.personal?.name) return toast.error("Employee name is required.");
    const dept = TagService.getDeptById(formData.work?.departmentId || '');
    const resolvedForm = { ...formData, work: { ...formData.work!, department: dept?.name || formData.work?.department || '' } };
    const all = HRService.getEmployees();
    let updated: Employee[];
    let successMsg = "";
    let empId = editingId || Date.now().toString();
    if (editingId) {
      updated = all.map(emp => emp.id === editingId ? { ...(resolvedForm as Employee), id: editingId, company } : emp);
      successMsg = "Employee record updated.";
    } else {
      const newEmployee: Employee = { ...(resolvedForm as Employee), id: empId, company };
      updated = [...all, newEmployee];
      const accountMsg = autoCreateLedgerAccount(newEmployee.personal.name);
      successMsg = "Employee enrolled successfully.";
      if (accountMsg) successMsg += `\n\n${accountMsg}`;
    }
    HRService.saveEmployees(updated);
    // Record salary history if salary changed
    if (editingId) {
      const prev = employees.find(e => e.id === editingId);
      const prevGross = prev ? (prev.salary.basic + prev.salary.houseRent + prev.salary.conveyance + prev.salary.specialAllowance) : 0;
      const newGross = (formData.salary?.basic||0) + (formData.salary?.houseRent||0) + (formData.salary?.conveyance||0) + (formData.salary?.specialAllowance||0);
      if (prevGross !== newGross && formData.salary?.basic) {
        const history = (formData as any).salaryHistory || [];
        (formData as any).salaryHistory = [...history, {
          date: new Date().toISOString().split('T')[0],
          basic: formData.salary.basic,
          gross: newGross,
          reason: 'Manual update',
          changedBy: 'HR',
        }];
      }
    }
    if (selectedTagIds.length > 0) TagService.setEmployeeTags(empId, selectedTagIds);
    setEmployees(updated.filter(e => e.company === company));
    setIsModalOpen(false);
    resetForm();
    toast.success(successMsg);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Delete this employee? This cannot be undone.")) {
      const all = HRService.getEmployees();
      HRService.saveEmployees(all.filter(e => e.id !== id));
      TagService.setEmployeeTags(id, []);
      setEmployees(HRService.getEmployees().filter(e => e.company === company));
    }
  };

  const handleEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData(emp);
    const existingTags = TagService.getEmployeeTags(emp.id);
    setSelectedTagIds(existingTags.map(et => et.tagId));
    setModalTab('personal');
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setSelectedTagIds([]);
    setModalTab('personal');
  };

  const filteredEmployees = employees.filter(e => {
    // Hide resigned/terminated unless toggle is on
    if (!showInactive && INACTIVE_STATUSES.includes(e.work.status as EmployeeStatus)) return false;
    // Search filter
    return e.personal.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || 
      e.work.employeeCode.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
  });
  const inactiveCount = employees.filter(e => INACTIVE_STATUSES.includes(e.work.status as EmployeeStatus)).length;
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Build current employee object for DocumentFolder (when editing)
  const currentEmployee = editingId ? employees.find(e => e.id === editingId) : null;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <DocExpiryAlerts />
          {/* Probation alerts */}
          {(() => {
            const today = new Date();
            const in30 = new Date(today); in30.setDate(today.getDate() + 30);
            const alerts = employees.filter(e => {
              if (e.work.status !== 'probation' || !e.work.joinDate) return false;
              const probEnd = new Date(e.work.joinDate);
              probEnd.setMonth(probEnd.getMonth() + 3);
              return probEnd >= today && probEnd <= in30;
            });
            if (!alerts.length) return null;
            return (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-2">⚠ Probation Ending Soon</p>
                {alerts.map(e => {
                  const probEnd = new Date(e.work.joinDate); probEnd.setMonth(probEnd.getMonth() + 3);
                  const days = Math.ceil((probEnd.getTime() - today.getTime()) / 86400000);
                  return <p key={e.id} className="text-xs text-amber-800 font-bold">{e.personal.name} ({e.work.employeeCode}) — {days} days left</p>;
                })}
              </div>
            );
          })()}
          <input type="text" placeholder="Search by name or code..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex space-x-3 w-full md:w-auto overflow-x-auto no-scrollbar">
          <button onClick={() => setShowInactive(!showInactive)}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all font-bold text-sm border whitespace-nowrap ${
              showInactive ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
            }`}>
            {showInactive ? <EyeOff size={16} /> : <Eye size={16} />}
            <span>{showInactive ? 'Active Employees' : `Resigned / Terminated (${inactiveCount})`}</span>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-slate-200 transition-all font-bold text-sm border border-slate-200 whitespace-nowrap"><FileUp size={18} /><span>Import</span></button>
          <button onClick={handleExportExcel} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-slate-200 transition-all font-bold text-sm border border-slate-200 whitespace-nowrap"><Download size={18} /><span>Export</span></button>
          <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 font-bold text-sm whitespace-nowrap"><UserPlus size={18} /><span>Add Employee</span></button>
        </div>
      </div>

      {/* ── Employee List Table ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Employee profile</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tags</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Department</th>
                <th className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Docs</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gross salary</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedEmployees.length > 0 ? paginatedEmployees.map((emp) => {
                const dept = TagService.getDeptById(emp.work.departmentId || '');
                const photoUrl = EmployeeDocService.getPhotoUrl(emp.id);
                const docCompleteness = EmployeeDocService.getCompleteness(emp.id);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setViewingEmployee(emp)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        {photoUrl ? (
                          <img src={photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${
                            INACTIVE_STATUSES.includes(emp.work.status as EmployeeStatus)
                              ? 'bg-red-50 text-red-400 border-red-200 opacity-60'
                              : 'bg-blue-100 text-blue-600 border-blue-200'
                          }`}>
                            {emp.personal.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-bold leading-tight ${INACTIVE_STATUSES.includes(emp.work.status as EmployeeStatus) ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{emp.personal.name}</p>
                            {emp.work.status && emp.work.status !== 'confirmed' && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_OPTIONS.find(s => s.value === emp.work.status)?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                {STATUS_OPTIONS.find(s => s.value === emp.work.status)?.label || emp.work.status}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-semibold">{emp.work.employeeCode}</p>
                          {(emp.work as any).lastDate && (
                            <p className="text-[10px] text-red-400 font-semibold">Last day: {(emp.work as any).lastDate}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <EmployeeTagPills employeeId={emp.id} size="sm" maxDisplay={3} />
                      {TagService.getEmployeeTags(emp.id).length === 0 && emp.work.designation && (
                        <span className="text-xs text-slate-500 italic">{emp.work.designation}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <Building2 size={14} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-600">{dept?.name || emp.work.department || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-xs font-black ${docCompleteness === 100 ? 'text-emerald-600' : docCompleteness >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                          {docCompleteness}%
                        </span>
                        <div className="w-12 bg-slate-100 rounded-full h-1 mt-1">
                          <div className={`h-1 rounded-full ${docCompleteness === 100 ? 'bg-emerald-500' : docCompleteness >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${docCompleteness}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-slate-900">PKR {(emp.salary.basic + emp.salary.houseRent + emp.salary.conveyance + emp.salary.specialAllowance).toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Base: {emp.salary.basic.toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(emp); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(emp.id); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">No employees found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredEmployees.length > itemsPerPage && (
        <Pagination currentPage={currentPage} totalPages={Math.ceil(filteredEmployees.length / itemsPerPage)} onPageChange={setCurrentPage} />
      )}

      {/* ── Employee Modal with Tabs ─────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]">
            {/* Modal Tab Bar */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl">
                {([
                  { id: 'personal', label: 'Personal', icon: UserCircle },
                  { id: 'employment', label: 'Work & Tags', icon: Tags },
                  { id: 'salary', label: 'Salary', icon: Wallet },
                  ...(editingId ? [{ id: 'documents', label: 'Documents', icon: FolderOpen }] : []),
                  ...(editingId ? [{ id: 'salaryhistory', label: 'Salary History', icon: Wallet }] : []),
                  ...(editingId ? [{ id: 'disciplinary', label: 'Disciplinary', icon: Briefcase }] : []),
                  ...(editingId ? [{ id: 'transfer', label: 'Transfers', icon: Building2 }] : []),
                ] as { id: ModalTab; label: string; icon: any }[]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setModalTab(tab.id)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center space-x-1.5 ${
                      modalTab === tab.id ? 'bg-white text-slate-900 shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <tab.icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-slate-400 hover:text-white p-2 rounded-full transition-colors"><X size={20} /></button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50">
              <div className="p-8 space-y-6 max-w-4xl mx-auto">

                {/* ── Personal Tab ────────────────────────────────────── */}
                {modalTab === 'personal' && (
                  <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                      <UserCircle className="text-blue-600" size={22} />
                      <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Personal information</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Full name</label><input type="text" placeholder="e.g. Ali Ahmed" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.name} onChange={e => setFormData({...formData, personal: {...formData.personal!, name: e.target.value}})} /></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">CNIC number</label><input type="text" placeholder="35201-XXXXXXX-X" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.cnic} onChange={e => setFormData({...formData, personal: {...formData.personal!, cnic: e.target.value}})} /></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Phone number</label><input type="text" placeholder="0300-XXXXXXX" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.phone} onChange={e => setFormData({...formData, personal: {...formData.personal!, phone: e.target.value}})} /></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Address</label><input type="text" placeholder="Full home address" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.address} onChange={e => setFormData({...formData, personal: {...formData.personal!, address: e.target.value}})} /></div>
                      <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Emergency Contact Name</label><input type="text" placeholder="Next of kin name" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={(formData.personal as any)?.emergencyContact || ''} onChange={e => setFormData({...formData, personal: {...formData.personal!, emergencyContact: e.target.value}})} /></div><div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Emergency Phone</label><input type="text" placeholder="0300-XXXXXXX" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={(formData.personal as any)?.emergencyPhone || ''} onChange={e => setFormData({...formData, personal: {...formData.personal!, emergencyPhone: e.target.value}})} /></div></div>
                    </div>
                  </section>
                )}

                {/* ── Employment & Tags Tab ───────────────────────────── */}
                {modalTab === 'employment' && (
                  <>
                    <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                      <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                        <Briefcase className="text-indigo-600" size={22} />
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Employment details</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Employee ID</label><input type="text" readOnly className="w-full bg-slate-100 border border-slate-200 p-3 rounded-xl outline-none font-black text-blue-600 uppercase cursor-not-allowed" value={formData.work?.employeeCode} /></div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Department</label>
                          <select className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none" value={formData.work?.departmentId || ''} onChange={e => setFormData({...formData, work: {...formData.work!, departmentId: e.target.value}})}>
                            <option value="">Select department...</option>
                            {companyDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Joining date</label><input type="date" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.work?.joinDate} onChange={e => setFormData({...formData, work: {...formData.work!, joinDate: e.target.value}})} /></div>
                        <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Last Working Date</label><input type="date" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={(formData.work as any)?.lastDate || ''} onChange={e => setFormData({...formData, work: {...formData.work!, lastDate: e.target.value}})} /></div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Status</label>
                          <select
                            className={`w-full border p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none ${
                              INACTIVE_STATUSES.includes(formData.work?.status as EmployeeStatus)
                                ? 'bg-red-50 border-red-200 text-red-700'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.work?.status || 'confirmed'}
                            onChange={e => setFormData({...formData, work: {...formData.work!, status: e.target.value as EmployeeStatus}})}
                          >
                            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Site / Location</label>
                          <select
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none"
                            value={formData.work?.site || ''}
                            onChange={e => setFormData({...formData, work: {...formData.work!, site: e.target.value}})}
                          >
                            <option value="">Select site...</option>
                            <option value="Factory - Main">Factory - Main</option>
                            <option value="Factory - GTK">Factory - GTK</option>
                            <option value="Factory - GTI">Factory - GTI</option>
                            <option value="Office - Head Office">Office - Head Office</option>
                            <option value="Site - Field">Site - Field</option>
                            <option value="Warehouse">Warehouse</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>
                    </section>

                    <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                      <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                        <Tags className="text-purple-600" size={22} />
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Job titles & designations</h4>
                      </div>
                      <TagSelector companyTags={companyTags.filter(t => t.category === 'job_title')} selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} category="job_title" label="Job titles (select all that apply)" />
                      <TagSelector companyTags={companyTags.filter(t => t.category === 'designation')} selectedTagIds={selectedTagIds} onChange={setSelectedTagIds} category="designation" label="Designations (select all that apply)" />
                      {selectedTagIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                          <span className="text-[10px] font-black text-emerald-700 uppercase mr-2 self-center">Selected:</span>
                          {selectedTagIds.map(tid => {
                            const tag = companyTags.find(t => t.id === tid);
                            return tag ? <span key={tid} className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: tag.color, color: tag.textColor }}>{tag.label}</span> : null;
                          })}
                        </div>
                      )}
                    </section>
                  </>
                )}

                {/* ── Salary Tab ──────────────────────────────────────── */}
                {modalTab === 'salary' && (
                  <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                      <Wallet className="text-green-600" size={22} />
                      <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Compensation package</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Basic salary</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">PKR</span><input type="number" className="w-full bg-slate-50 border border-slate-200 p-3 pl-12 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-slate-900" value={formData.salary?.basic || ''} onChange={e => setFormData({...formData, salary: {...formData.salary!, basic: Number(e.target.value)}})} /></div></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">House rent</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">PKR</span><input type="number" className="w-full bg-slate-50 border border-slate-200 p-3 pl-12 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-slate-900" value={formData.salary?.houseRent || ''} onChange={e => setFormData({...formData, salary: {...formData.salary!, houseRent: Number(e.target.value)}})} /></div></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Conveyance</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">PKR</span><input type="number" className="w-full bg-slate-50 border border-slate-200 p-3 pl-12 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-slate-900" value={formData.salary?.conveyance || ''} onChange={e => setFormData({...formData, salary: {...formData.salary!, conveyance: Number(e.target.value)}})} /></div></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Special allowance</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">PKR</span><input type="number" className="w-full bg-slate-50 border border-slate-200 p-3 pl-12 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-slate-900" value={formData.salary?.specialAllowance || ''} onChange={e => setFormData({...formData, salary: {...formData.salary!, specialAllowance: Number(e.target.value)}})} /></div></div>
                      <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Medical Allowance</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">PKR</span><input type="number" className="w-full bg-slate-50 border border-slate-200 p-3 pl-12 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-slate-900" value={(formData.salary as any)?.medicalAllowance || ''} onChange={e => setFormData({...formData, salary: {...formData.salary!, medicalAllowance: Number(e.target.value)}})} /></div></div>
                      <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl"><input type="checkbox" id="eobi" checked={(formData.salary as any)?.eobi || false} onChange={e => setFormData({...formData, salary: {...formData.salary!, eobi: e.target.checked}})} className="w-4 h-4 accent-blue-600" /><label htmlFor="eobi" className="text-xs font-black text-blue-700 uppercase tracking-widest cursor-pointer">EOBI Registered (PKR 370/month deduction)</label></div>
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex justify-between items-center">
                      <span className="text-sm font-black text-blue-900 uppercase tracking-tighter">Gross monthly:</span>
                      <span className="text-xl font-black text-blue-600">PKR {((formData.salary?.basic||0) + (formData.salary?.houseRent||0) + (formData.salary?.conveyance||0) + (formData.salary?.specialAllowance||0)).toLocaleString()}</span>
                    </div>
                  </section>
                )}

                {/* ── Salary History Tab ─────────────────────────── */}
                {modalTab === 'salaryhistory' && editingId && (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Salary Change History</p>
                    {((formData as any).salaryHistory || []).length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No salary changes recorded yet.</p>
                    ) : (
                      <table className="w-full text-sm border-collapse">
                        <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase"><th className="p-2 text-left">Date</th><th className="p-2 text-right">Basic</th><th className="p-2 text-right">Gross</th><th className="p-2 text-left">Reason</th></tr></thead>
                        <tbody>
                          {((formData as any).salaryHistory || []).map((h: any, i: number) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="p-2 font-bold">{h.date}</td>
                              <td className="p-2 text-right">{h.basic?.toLocaleString()}</td>
                              <td className="p-2 text-right font-black text-blue-600">{h.gross?.toLocaleString()}</td>
                              <td className="p-2 text-slate-500">{h.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── Disciplinary Tab ─────────────────────────────── */}
                {modalTab === 'disciplinary' && editingId && <DisciplinaryManager employeeId={editingId} />}

                {/* ── Transfer Tab ─────────────────────────────────── */}
                {modalTab === 'transfer' && editingId && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Inter-Company Transfers</p>
                      <button onClick={() => {
                        const toCompany = prompt('Transfer to (GTK/GTI/Glassco/Nippon/Factory):');
                        if (!toCompany) return;
                        const reason = prompt('Reason:');
                        if (!reason) return;
                        const approver = prompt('Approved by:');
                        if (!approver) return;
                        const history = (formData as any).transferHistory || [];
                        setFormData({...formData, transferHistory: [...history, {
                          date: new Date().toISOString().split('T')[0],
                          fromCompany: String(formData.company),
                          toCompany, reason, approvedBy: approver,
                        }], company: toCompany} as any);
                      }} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase hover:bg-blue-700">+ Transfer</button>
                    </div>
                    {((formData as any).transferHistory || []).length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No transfers on record</p>
                    ) : (
                      <table className="w-full text-xs border-collapse">
                        <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase"><th className="p-2 text-left">Date</th><th className="p-2 text-center">From</th><th className="p-2 text-center">To</th><th className="p-2 text-left">Reason</th><th className="p-2">By</th></tr></thead>
                        <tbody>
                          {((formData as any).transferHistory || []).map((h: any, i: number) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="p-2 font-bold">{h.date}</td>
                              <td className="p-2 text-center font-bold text-rose-600">{h.fromCompany}</td>
                              <td className="p-2 text-center font-bold text-emerald-600">{h.toCompany}</td>
                              <td className="p-2 text-slate-500">{h.reason}</td>
                              <td className="p-2 text-slate-500">{h.approvedBy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* ── Documents Tab (only for existing employees) ─────── */}
                {modalTab === 'documents' && currentEmployee && (
                  <DocumentFolder
                    employee={currentEmployee}
                    onPhotoChange={(url) => {
                      // Update employee list to show new photo immediately
                      setEmployees(prev => prev.map(e => e.id === currentEmployee.id ? { ...e, personal: { ...e.personal, photoUrl: url } } : e));
                    }}
                  />
                )}
              </div>
            </div>

            {/* Modal Footer (hidden on Documents tab) */}
            {modalTab !== 'documents' && (
              <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
                <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-6 py-3 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-slate-800">Discard</button>
                <button onClick={handleSave} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all">
                  {editingId ? 'Update record' : 'Enroll employee'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Employee Profile Card (Full Page) ──────────────────────── */}
      {viewingEmployee && (
        <EmployeeProfileCard
          employee={viewingEmployee}
          onClose={() => setViewingEmployee(null)}
        />
      )}
    </div>
  );
};

export default React.memo(EmployeeManagement);
