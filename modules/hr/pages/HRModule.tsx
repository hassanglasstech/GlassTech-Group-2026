import React, { useState } from 'react';
import { useAppStore } from '@/modules/shared/store/appStore';
import EmployeeManagement from './EmployeeManagement';
import AttendanceRegister from './AttendanceRegister';
import LoanManagement from './LoanManagement';
import PayrollManagement from './PayrollManagement';
import LeaveManagement from './LeaveManagement';
import TagManager from './TagManager';
import ShiftMaster from './ShiftMaster';
import { Users, ClipboardCheck, Landmark, CreditCard, Settings, CalendarDays } from 'lucide-react';

const HRModule: React.FC = () => {
  const company = useAppStore(state => state.selectedCompany);
  const [activeTab, setActiveTab] = useState<'registry' | 'attendance' | 'loans' | 'payroll' | 'leave' | 'settings'>('registry');

  const tabs = [
    { id: 'registry',    label: 'Registry',    icon: Users },
    { id: 'attendance',  label: 'Attendance',  icon: ClipboardCheck },
    { id: 'leave',       label: 'Leave',        icon: CalendarDays },
    { id: 'loans',       label: 'Loans',        icon: Landmark },
    { id: 'payroll',     label: 'Payroll',      icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 no-print">
        <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
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
        <button
          onClick={() => setActiveTab('settings')}
          title="Tags & Departments"
          className={`p-2.5 rounded-xl border transition-all ${activeTab === 'settings' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700 hover:border-slate-300'}`}
        >
          <Settings size={18} />
        </button>
      </div>
      {activeTab === 'registry'   && <EmployeeManagement company={company} />}
      {activeTab === 'attendance' && <AttendanceRegister company={company} />}
      {activeTab === 'leave'      && <LeaveManagement company={company} />}
      {activeTab === 'loans'      && <LoanManagement company={company} />}
      {activeTab === 'payroll'    && <PayrollManagement company={company} />}
      {activeTab === 'settings'   && (
        <div className="space-y-8">
          <TagManager />
          <hr className="border-slate-200"/>
          <ShiftMaster />
        </div>
      )}
    </div>
  );
};

export default React.memo(HRModule);
