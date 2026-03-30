
import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '@/modules/shared/hooks/useDebounce';
import { Employee, Account, Company, TagMaster, Department } from '@/modules/shared/types';
import { HRService } from '@/modules/hr/services/hrService';
import { TagService } from '@/modules/hr/services/tagService';
import { FinanceService } from '@/modules/finance/services/financeService';
import { EmployeeTagPills, TagSelector } from '@/modules/hr/components/TagPills';
import { UserPlus, Search, Edit2, Trash2, X, Briefcase, Wallet, UserCircle, FileUp, Download, Layers, Building2, Tags } from 'lucide-react';
import Pagination from '@/components/Pagination';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const EmployeeManagement: React.FC<{ company: Company }> = ({ company }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    TagService.initSeedData();
    const currentEmployees = HRService.getEmployees().filter(e => e.company === company);
    setEmployees(currentEmployees);
    setCompanyTags(TagService.getTags(company));
    setCompanyDepts(TagService.getDepartments(company));
  }, [company]);

  // Handle auto-generation of Employee ID when modal opens for new entry
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
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data: any[] = XLSX.utils.sheet_to_json(ws);

      const importedEmployees: Employee[] = data.map((row, index) => ({
        id: (Date.now() + index).toString(),
        company,
        personal: {
          name: row.Name || '',
          cnic: row.CNIC || '',
          phone: row.Phone || '',
          address: row.Address || ''
        },
        work: {
          designation: row.Designation || '',
          department: row.Department || '',
          departmentId: '',
          grade: row.Grade || '',
          joinDate: row.JoinDate || new Date().toISOString().split('T')[0],
          employeeCode: row.EmployeeCode || `${company}-${index}`
        },
        salary: {
          basic: Number(row.Basic) || 0,
          houseRent: Number(row.HouseRent) || 0,
          conveyance: Number(row.Conveyance) || 0,
          specialAllowance: Number(row.SpecialAllowance) || 0
        }
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
      return {
        'Name': emp.personal.name,
        'EmployeeCode': emp.work.employeeCode,
        'CNIC': emp.personal.cnic,
        'Phone': emp.personal.phone,
        'Address': emp.personal.address,
        'Job Titles': jobTitles || emp.work.designation,
        'Designations': designations,
        'Department': dept?.name || emp.work.department,
        'Grade': emp.work.grade,
        'JoinDate': emp.work.joinDate,
        'Basic': emp.salary.basic,
        'HouseRent': emp.salary.houseRent,
        'Conveyance': emp.salary.conveyance,
        'SpecialAllowance': emp.salary.specialAllowance
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, `${company}_Employee_Registry.xlsx`);
  };

  // --- AUTOMATED ACCOUNT CREATION LOGIC ---
  const autoCreateLedgerAccount = (employeeName: string) => {
    const allAccounts = FinanceService.getAccounts();
    const companyAccounts = allAccounts.filter(a => a.company === company);
    const salaryParent = companyAccounts.find(a => 
      a.level === 4 && 
      (a.name.toUpperCase().includes('SALAR') || a.name.toUpperCase().includes('WAGE') || a.name.toUpperCase().includes('PAYROLL'))
    );

    if (salaryParent) {
      const exists = companyAccounts.find(a => 
        a.parentId === salaryParent.id && 
        a.name.toLowerCase() === employeeName.toLowerCase()
      );

      if (!exists) {
        const siblings = companyAccounts.filter(a => a.parentId === salaryParent.id);
        const nextSeq = (siblings.length + 1).toString().padStart(3, '0');
        const newCode = `${salaryParent.code}-${nextSeq}`;

        const newAccount: Account = {
          id: `${company}-ACC-EMP-${Date.now()}`,
          company,
          code: newCode,
          name: employeeName,
          level: 5,
          parentId: salaryParent.id,
          type: 'Expense'
        };

        FinanceService.saveAccounts([...allAccounts, newAccount]);
        return `Linked L5 Account Created: ${newAccount.name} (${newAccount.code})`;
      }
    }
    return null;
  };

  const handleSave = () => {
    if (!formData.personal?.name) return toast.error("Employee name is required.");
    
    // Resolve department name from departmentId for backward compat
    const dept = TagService.getDeptById(formData.work?.departmentId || '');
    const resolvedForm = {
      ...formData,
      work: {
        ...formData.work!,
        department: dept?.name || formData.work?.department || '',
      }
    };

    const all = HRService.getEmployees();
    let updated: Employee[];
    let successMsg = "";
    let empId = editingId || Date.now().toString();

    if (editingId) {
      updated = all.map(emp => emp.id === editingId ? { ...(resolvedForm as Employee), id: editingId, company } : emp);
      successMsg = "Employee record updated.";
    } else {
      const newEmployee: Employee = {
        ...(resolvedForm as Employee),
        id: empId,
        company
      };
      updated = [...all, newEmployee];
      
      const accountMsg = autoCreateLedgerAccount(newEmployee.personal.name);
      successMsg = "Employee enrolled successfully.";
      if (accountMsg) successMsg += `\n\n${accountMsg}`;
    }
    
    HRService.saveEmployees(updated);

    // Save tags for this employee
    if (selectedTagIds.length > 0) {
      TagService.setEmployeeTags(empId, selectedTagIds);
    }

    setEmployees(updated.filter(e => e.company === company));
    setIsModalOpen(false);
    resetForm();
    toast.success(successMsg);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this employee? This action cannot be undone.")) {
      const all = HRService.getEmployees();
      const updated = all.filter(e => e.id !== id);
      HRService.saveEmployees(updated);
      // Also clean up employee tags
      TagService.setEmployeeTags(id, []);
      setEmployees(updated.filter(e => e.company === company));
    }
  };

  const handleEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormData(emp);
    // Load existing tags
    const existingTags = TagService.getEmployeeTags(emp.id);
    setSelectedTagIds(existingTags.map(et => et.tagId));
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setSelectedTagIds([]);
  };

  const filteredEmployees = employees.filter(e => 
    e.personal.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) || 
    e.work.employeeCode.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
  );

  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by name or code..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex space-x-3 w-full md:w-auto overflow-x-auto no-scrollbar">
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls" />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-slate-200 transition-all font-bold text-sm border border-slate-200 whitespace-nowrap"
          >
            <FileUp size={18} />
            <span>Import</span>
          </button>
          <button 
            onClick={handleExportExcel}
            className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-slate-200 transition-all font-bold text-sm border border-slate-200 whitespace-nowrap"
          >
            <Download size={18} />
            <span>Export</span>
          </button>
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 font-bold text-sm whitespace-nowrap"
          >
            <UserPlus size={18} />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* ── Employee List Table ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Employee profile</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tags</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Department</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gross salary</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedEmployees.length > 0 ? paginatedEmployees.map((emp) => {
                const dept = TagService.getDeptById(emp.work.departmentId || '');
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm border border-blue-200">
                          {emp.personal.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{emp.personal.name}</p>
                          <p className="text-[11px] text-slate-400 font-semibold">{emp.work.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <EmployeeTagPills employeeId={emp.id} size="sm" maxDisplay={3} />
                      {/* Fallback: show legacy designation if no tags */}
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
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-black text-slate-900">PKR {(emp.salary.basic + emp.salary.houseRent + emp.salary.conveyance + emp.salary.specialAllowance).toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400 font-medium tracking-tight">Base: {emp.salary.basic.toLocaleString()}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(emp)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(emp.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">No employees found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredEmployees.length > itemsPerPage && (
        <Pagination 
          currentPage={currentPage} 
          totalPages={Math.ceil(filteredEmployees.length / itemsPerPage)} 
          onPageChange={setCurrentPage} 
        />
      )}

      {/* ── Employee Add/Edit Modal ──────────────────────────────────── */}
      {isModalOpen && (<div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[500]"><div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 max-h-[90vh]">
        <div className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-10 space-y-8 max-w-4xl mx-auto">
            {/* Personal Information */}
            <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                <UserCircle className="text-blue-600" size={22} />
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Personal information</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Full name</label><input type="text" placeholder="e.g. Ali Ahmed" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.name} onChange={e => setFormData({...formData, personal: {...formData.personal!, name: e.target.value}})} /></div>
                <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">CNIC number</label><input type="text" placeholder="35201-XXXXXXX-X" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.cnic} onChange={e => setFormData({...formData, personal: {...formData.personal!, cnic: e.target.value}})} /></div>
                <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Phone number</label><input type="text" placeholder="0300-XXXXXXX" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.phone} onChange={e => setFormData({...formData, personal: {...formData.personal!, phone: e.target.value}})} /></div>
                <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Residential address</label><input type="text" placeholder="Full home address" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.personal?.address} onChange={e => setFormData({...formData, personal: {...formData.personal!, address: e.target.value}})} /></div>
              </div>
            </section>

            {/* Employment Details */}
            <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                <Briefcase className="text-indigo-600" size={22} />
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Employment details</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Employee ID code</label><input type="text" readOnly className="w-full bg-slate-100 border border-slate-200 p-3 rounded-xl outline-none font-black text-blue-600 uppercase cursor-not-allowed" value={formData.work?.employeeCode} /></div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Department</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <select
                      className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none"
                      value={formData.work?.departmentId || ''}
                      onChange={e => setFormData({...formData, work: {...formData.work!, departmentId: e.target.value}})}
                    >
                      <option value="">Select department...</option>
                      {companyDepts.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">Joining date</label><input type="date" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.work?.joinDate} onChange={e => setFormData({...formData, work: {...formData.work!, joinDate: e.target.value}})} /></div>
              </div>
            </section>

            {/* Tags Section — NEW */}
            <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
                <Tags className="text-purple-600" size={22} />
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Job titles & designations</h4>
              </div>
              <TagSelector
                companyTags={companyTags.filter(t => t.category === 'job_title')}
                selectedTagIds={selectedTagIds}
                onChange={setSelectedTagIds}
                category="job_title"
                label="Job titles (select all that apply)"
              />
              <TagSelector
                companyTags={companyTags.filter(t => t.category === 'designation')}
                selectedTagIds={selectedTagIds}
                onChange={setSelectedTagIds}
                category="designation"
                label="Designations (select all that apply)"
              />
              {/* Selected summary */}
              {selectedTagIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-[10px] font-black text-emerald-700 uppercase mr-2 self-center">Selected:</span>
                  {selectedTagIds.map(tid => {
                    const tag = companyTags.find(t => t.id === tid);
                    return tag ? (
                      <span key={tid} className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: tag.color, color: tag.textColor }}>
                        {tag.label}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </section>

            {/* Compensation Package */}
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
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex justify-between items-center">
                <span className="text-sm font-black text-blue-900 uppercase tracking-tighter">Gross monthly compensation:</span>
                <span className="text-xl font-black text-blue-600">PKR {((formData.salary?.basic || 0) + (formData.salary?.houseRent || 0) + (formData.salary?.conveyance || 0) + (formData.salary?.specialAllowance || 0)).toLocaleString()}</span>
              </div>
            </section>
          </div>
        </div>
        <div className="px-10 py-6 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
          <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-6 py-3 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-slate-800">Discard changes</button>
          <button onClick={handleSave} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all flex items-center space-x-2"><span>{editingId ? 'Update record' : 'Enroll employee'}</span></button>
        </div>
      </div></div>)}
    </div>
  );
};

export default React.memo(EmployeeManagement);
