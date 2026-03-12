import React from 'react';

interface FactoryMetrics {
  expenses: number;
  repairMaintenance: number;
  assetPurchases: number;
  consumablePurchases: number;
}

interface Props {
  metrics: FactoryMetrics;
}

const FactoryFinanceDashboardView: React.FC<Props> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Total Expenses</h3>
        <p className="text-3xl font-bold text-slate-900">PKR {metrics.expenses.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Repair & Maintenance</h3>
        <p className="text-3xl font-bold text-amber-600">PKR {metrics.repairMaintenance.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Asset Purchases</h3>
        <p className="text-3xl font-bold text-blue-600">PKR {metrics.assetPurchases.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Consumable Purchases</h3>
        <p className="text-3xl font-bold text-emerald-600">PKR {metrics.consumablePurchases.toLocaleString()}</p>
      </div>
    </div>
  );
};

export default FactoryFinanceDashboardView;
