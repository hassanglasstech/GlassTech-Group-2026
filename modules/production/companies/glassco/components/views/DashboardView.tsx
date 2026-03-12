import React from 'react';
import { ProductionMetric, DailyTarget } from '@/modules/production/types/production';
import { ProductionCostService } from '@/modules/production/services/productionCostService';

const DashboardView: React.FC = () => {
  // Placeholder data - in real app, fetch from service
  const today = new Date().toISOString().split('T')[0];
  const metrics: ProductionMetric = ProductionCostService.getGlasscoMetrics(today);
  const target: DailyTarget = ProductionCostService.getGlasscoDailyTarget(1000, 20);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Daily SqFt Processed</h3>
        <p className="text-3xl font-bold text-slate-900">{metrics.sqFtProcessed}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Daily Target</h3>
        <p className="text-3xl font-bold text-blue-600">{target.targetSqFt.toFixed(0)}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Overtime Cost</h3>
        <p className="text-3xl font-bold text-red-600">PKR {metrics.overtimeCost.toLocaleString()}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-500 uppercase">Efficiency Gap</h3>
        <p className="text-3xl font-bold text-amber-600">
          PKR {(metrics.overtimeCost - metrics.normalCost).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default DashboardView;
