import React from 'react';
import { FinanceMetric } from '@/modules/finance/types/finance';

interface Props {
  metrics: FinanceMetric;
}

const FinanceDashboardView: React.FC<Props> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Cash Position</h3>
        <p className="text-3xl font-bold text-slate-900">PKR {metrics.cashPosition.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Accounts Receivable</h3>
        <p className="text-3xl font-bold text-blue-600">PKR {metrics.accountsReceivable.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Accounts Payable</h3>
        <p className="text-3xl font-bold text-red-600">PKR {metrics.accountsPayable.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Net Profit</h3>
        <p className="text-3xl font-bold text-emerald-600">PKR {metrics.netProfit.toLocaleString()}</p>
      </div>
    </div>
  );
};

export default FinanceDashboardView;
