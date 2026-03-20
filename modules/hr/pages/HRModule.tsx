import React, { useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import OldDisbursements from '@/modules/shared/pages/OldDisbursements';
import EmployeeManagement from './EmployeeManagement';
import AttendanceRegister from '../companies/glassco/components/AttendanceRegister';
import LoanManagement from './LoanManagement';
import PayrollManagement from './PayrollManagement';
import { Users, ClipboardCheck, Landmark, CreditCard, History } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-full md:w-fit no-print">
        <div className="sap-scroll-container">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`sap-tab-button ${activeTab === tab.id ? 'sap-tab-active' : ''}`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      {activeTab === 'registry' && <EmployeeManagement company={company} />}
      {activeTab === 'attendance' && <AttendanceRegister company={company} />}
      {activeTab === 'loans' && <LoanManagement company={company} />}
      {activeTab === 'payroll' && <PayrollManagement company={company} />}
      {activeTab === 'history' && <OldDisbursements />}
    </div>
  );
};

export default React.memo(HRModule);
