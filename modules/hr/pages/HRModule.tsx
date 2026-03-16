
import React, { useState } from 'react';
import { Company } from '../../shared/types';
import { Users, ClipboardCheck, Landmark, CreditCard, History } from 'lucide-react';

import { useAppStore } from '../../shared/store/appStore';
import OldDisbursements from '../../shared/pages/OldDisbursements';

import GlasscoEmployeeManagement from '../companies/glassco/components/EmployeeManagement';
import NipponEmployeeManagement from '../companies/nippon/components/EmployeeManagement';
import GlasscoAttendanceRegister from '../companies/glassco/components/AttendanceRegister';
import NipponAttendanceRegister from '../companies/nippon/components/AttendanceRegister';
import GlasscoLoanManagement from '../companies/glassco/components/LoanManagement';
import NipponLoanManagement from '../companies/nippon/components/LoanManagement';
import GlasscoPayrollManagement from '../companies/glassco/components/PayrollManagement';
import NipponPayrollManagement from '../companies/nippon/components/PayrollManagement';

const HRModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'registry' | 'attendance' | 'loans' | 'payroll' | 'history'>('registry');

  const tabs = [
    { id: 'registry', label: 'Registry', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'loans', label: 'Loans', icon: Landmark },
    { id: 'payroll', label: 'Payroll', icon: CreditCard },
    { id: 'history', label: 'Old Records', icon: History },
  ];

  const EmployeeManagement = company === 'Glassco' ? GlasscoEmployeeManagement : NipponEmployeeManagement;
  const AttendanceRegister = company === 'Glassco' ? GlasscoAttendanceRegister : NipponAttendanceRegister;
  const LoanManagement = company === 'Glassco' ? GlasscoLoanManagement : NipponLoanManagement;
  const PayrollManagement = company === 'Glassco' ? GlasscoPayrollManagement : NipponPayrollManagement;

  return (
    <div className="space-y-6">
      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full md:w-fit no-print">
        <div className="sap-scroll-container">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === 'registry' && <EmployeeManagement company={company} />}
        {activeTab === 'attendance' && <AttendanceRegister company={company} />}
        {activeTab === 'loans' && <LoanManagement company={company} />}
        {activeTab === 'payroll' && <PayrollManagement company={company} />}
        {activeTab === 'history' && <OldDisbursements />}
      </div>
    </div>
  );
};

export default HRModule;
