import React, { useMemo } from 'react';
import { useProductionContext } from '@/modules/production/components/ProductionContext';
import { TrendingUp, TrendingDown, Minus, Scissors, Truck, Clock, AlertTriangle } from 'lucide-react';

const DashboardView: React.FC = () => {
  const { pieces, jobOrders, dispatches, analyticsData } = useProductionContext();

  // ── Helper: Get sqft for a piece from its parent job order ──
  const getPieceSqFt = (piece: any): number => {
    const job = jobOrders.find(j => j?.orderNo === piece?.orderId);
    const item = job?.items?.[piece?.itemIndex];
    if (!item) return 0;
    return (item.width * item.height) / 144;
  };

  // ── Helper: Date string YYYY-MM-DD ──
  const toDateStr = (d: Date) => d.toISOString().split('T')[0];
  const today = new Date();
  const todayStr = toDateStr(today);

  // ── Get week boundaries (Saturday = start, no Sunday work) ──
  const getWeekStart = (d: Date) => {
    const copy = new Date(d);
    const day = copy.getDay(); // 0=Sun, 6=Sat
    const diff = day === 0 ? 1 : (day === 6 ? 0 : day + 1); // Sat=0 offset
    copy.setDate(copy.getDate() - diff + (day === 6 ? 0 : 0));
    // Simple: go back to last Saturday
    const sat = new Date(d);
    sat.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    sat.setHours(0,0,0,0);
    return sat;
  };

  // ── Group all pieces by date they were last updated (proxy for cutting date) ──
  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    pieces.forEach(p => {
      if (!p?.lastUpdated) return;
      const date = p.lastUpdated.split('T')[0];
      const sqft = getPieceSqFt(p);
      map[date] = (map[date] || 0) + sqft;
    });
    return map;
  }, [pieces, jobOrders]);

  // ── Last 14 days data ──
  const last14Days = useMemo(() => {
    const days: { date: string; label: string; sqft: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = toDateStr(d);
      const dayOfWeek = d.getDay();
      // Skip Sunday (0)
      if (dayOfWeek === 0) continue;
      days.push({
        date: ds,
        label: d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }),
        sqft: Math.round(dailyData[ds] || 0)
      });
    }
    return days;
  }, [dailyData]);

  // ── Today's cutting ──
  const todaySqFt = Math.round(dailyData[todayStr] || 0);
  
  // ── Yesterday ──
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdaySqFt = Math.round(dailyData[toDateStr(yesterday)] || 0);
  const todayVsYesterday = yesterdaySqFt > 0 ? Math.round(((todaySqFt - yesterdaySqFt) / yesterdaySqFt) * 100) : 0;

  // ── This week (Sat-Fri, skip Sun) ──
  const thisWeekStart = getWeekStart(today);
  const thisWeekData = useMemo(() => {
    let total = 0;
    let workDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(thisWeekStart);
      d.setDate(d.getDate() + i);
      if (d > today) break;
      if (d.getDay() === 0) continue; // Skip Sunday
      const ds = toDateStr(d);
      total += (dailyData[ds] || 0);
      workDays++;
    }
    return { total: Math.round(total), workDays, avg: workDays > 0 ? Math.round(total / workDays) : 0 };
  }, [dailyData, thisWeekStart]);

  // ── Last week ──
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekData = useMemo(() => {
    let total = 0;
    let workDays = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(lastWeekStart);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0) continue;
      const ds = toDateStr(d);
      total += (dailyData[ds] || 0);
      workDays++;
    }
    return { total: Math.round(total), workDays, avg: workDays > 0 ? Math.round(total / workDays) : 0 };
  }, [dailyData, lastWeekStart]);

  const weekVsWeek = lastWeekData.total > 0 ? Math.round(((thisWeekData.total - lastWeekData.total) / lastWeekData.total) * 100) : 0;

  // ── This month ──
  const thisMonthKey = todayStr.substring(0, 7); // YYYY-MM
  const thisMonthData = useMemo(() => {
    let total = 0;
    let workDays = 0;
    const year = today.getFullYear();
    const month = today.getMonth();
    for (let d = 1; d <= today.getDate(); d++) {
      const date = new Date(year, month, d);
      if (date.getDay() === 0) continue;
      const ds = toDateStr(date);
      total += (dailyData[ds] || 0);
      workDays++;
    }
    return { total: Math.round(total), workDays, avg: workDays > 0 ? Math.round(total / workDays) : 0 };
  }, [dailyData]);

  // ── Last month ──
  const lastMonthData = useMemo(() => {
    let total = 0;
    let workDays = 0;
    const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const month = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      if (date.getDay() === 0) continue;
      const ds = toDateStr(date);
      total += (dailyData[ds] || 0);
      workDays++;
    }
    return { total: Math.round(total), workDays, avg: workDays > 0 ? Math.round(total / workDays) : 0 };
  }, [dailyData]);

  const monthVsMonth = lastMonthData.total > 0 ? Math.round(((thisMonthData.total - lastMonthData.total) / lastMonthData.total) * 100) : 0;

  // ── Monthly trend (last 6 months) ──
  const monthlyTrend = useMemo(() => {
    const months: { label: string; sqft: number; breakage: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = toDateStr(d).substring(0, 7);
      const label = d.toLocaleDateString('en-PK', { month: 'short' });
      let sqft = 0;
      let totalPcs = 0;
      let brokenPcs = 0;
      
      Object.entries(dailyData).forEach(([date, val]) => {
        if (date.startsWith(key)) sqft += val;
      });
      
      pieces.forEach(p => {
        if (!p?.lastUpdated || !p.lastUpdated.startsWith(key)) return;
        totalPcs++;
        if (p.status === 'Broken' || p.status === 'Returned' || p.status === 'QC-Failed') brokenPcs++;
      });
      
      months.push({ label, sqft: Math.round(sqft), breakage: totalPcs > 0 ? Number(((brokenPcs / totalPcs) * 100).toFixed(1)) : 0 });
    }
    return months;
  }, [dailyData, pieces]);

  // ── Weekly comparison data (day by day) ──
  const weeklyComparison = useMemo(() => {
    const days = ['Sat', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const dayIndices = [6, 1, 2, 3, 4, 5]; // JS day indices
    return days.map((label, i) => {
      const thisD = new Date(thisWeekStart);
      thisD.setDate(thisD.getDate() + (dayIndices[i] === 6 ? 0 : (dayIndices[i] - thisWeekStart.getDay() + 7) % 7));
      // Simple offset from week start
      const offsets = [0, 2, 3, 4, 5, 6]; // Sat=0, Mon=2, Tue=3...
      const thisDayDate = new Date(thisWeekStart);
      thisDayDate.setDate(thisWeekStart.getDate() + offsets[i]);
      
      const lastDayDate = new Date(lastWeekStart);
      lastDayDate.setDate(lastWeekStart.getDate() + offsets[i]);
      
      return {
        label,
        thisWeek: thisDayDate <= today ? Math.round(dailyData[toDateStr(thisDayDate)] || 0) : 0,
        lastWeek: Math.round(dailyData[toDateStr(lastDayDate)] || 0)
      };
    });
  }, [dailyData, thisWeekStart, lastWeekStart]);

  // ── Pending orders count ──
  const pendingJobs = useMemo(() => {
    const activeOrderIds = new Set(pieces.filter(p => p.status !== 'Delivered' && p.status !== 'Broken').map(p => p.orderId));
    return activeOrderIds.size;
  }, [pieces]);

  const pendingPieces = pieces.filter(p => p.status !== 'Delivered' && p.status !== 'Broken').length;
  const dispatchBacklog = pieces.filter(p => p.status === 'Ready to Dispatch' || p.status === 'QC-Passed').length;

  // ── Trend arrow component ──
  const TrendBadge = ({ value }: { value: number }) => {
    if (value === 0) return <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1"><Minus size={12}/> No change</span>;
    if (value > 0) return <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1"><TrendingUp size={12}/> +{value}%</span>;
    return <span className="text-[11px] text-rose-600 font-bold flex items-center gap-1"><TrendingDown size={12}/> {value}%</span>;
  };

  // ── Chart ID ref for cleanup ──
  const chartRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (chartRef.current) return;
    chartRef.current = true;

    const loadCharts = () => {
      if (typeof (window as any).Chart === 'undefined') {
        setTimeout(loadCharts, 200);
        return;
      }
      const Chart = (window as any).Chart;
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      const textColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';

      // Daily Line Chart
      const dailyCtx = document.getElementById('gc-daily-chart') as HTMLCanvasElement;
      if (dailyCtx) {
        new Chart(dailyCtx, {
          type: 'line',
          data: {
            labels: last14Days.map(d => d.label),
            datasets: [
              { label: 'Sq.ft', data: last14Days.map(d => d.sqft), borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#378ADD', fill: true, tension: 0.3 },
              { label: 'Avg', data: last14Days.map(() => thisWeekData.avg), borderColor: '#94a3b8', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, fill: false }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 } } },
              y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } }, beginAtZero: true } } }
        });
      }

      // Pipeline Donut
      const pipeCtx = document.getElementById('gc-pipeline-chart') as HTMLCanvasElement;
      if (pipeCtx) {
        new Chart(pipeCtx, {
          type: 'doughnut',
          data: {
            labels: ['Cut/Pending', 'Processing', 'QC Passed', 'Tempered', 'Delivered'],
            datasets: [{ data: [analyticsData.cut, analyticsData.qcPassed, analyticsData.tempered, analyticsData.delivered, analyticsData.defects || 0],
              backgroundColor: ['#378ADD', '#EF9F27', '#7F77DD', '#1D9E75', '#E24B4A'], borderWidth: 0 }]
          },
          options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } }
        });
      }

      // Weekly Comparison - Line
      const weekCtx = document.getElementById('gc-weekly-chart') as HTMLCanvasElement;
      if (weekCtx) {
        new Chart(weekCtx, {
          type: 'line',
          data: {
            labels: weeklyComparison.map(d => d.label),
            datasets: [
              { label: 'This week', data: weeklyComparison.map(d => d.thisWeek), borderColor: '#378ADD', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#378ADD', fill: false, tension: 0.3 },
              { label: 'Last week', data: weeklyComparison.map(d => d.lastWeek), borderColor: '#B5D4F4', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#B5D4F4', fill: false, tension: 0.3, borderDash: [4,2] }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
              y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } }, beginAtZero: true } } }
        });
      }

      // Monthly Trend - Line + Line dual axis
      const monthCtx = document.getElementById('gc-monthly-chart') as HTMLCanvasElement;
      if (monthCtx) {
        new Chart(monthCtx, {
          type: 'line',
          data: {
            labels: monthlyTrend.map(d => d.label),
            datasets: [
              { label: 'SqFt', data: monthlyTrend.map(d => d.sqft), borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#1D9E75', fill: true, tension: 0.3, yAxisID: 'y' },
              { label: 'Breakage %', data: monthlyTrend.map(d => d.breakage), borderColor: '#E24B4A', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#E24B4A', fill: false, tension: 0.3, yAxisID: 'y1' }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
              y: { position: 'left', grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } }, beginAtZero: true },
              y1: { position: 'right', grid: { display: false }, ticks: { color: '#E24B4A', font: { size: 10 }, callback: (v: any) => v + '%' }, min: 0, max: 10 } } }
        });
      }
    };

    // Load Chart.js dynamically
    if (typeof (window as any).Chart === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      script.onload = loadCharts;
      document.head.appendChild(script);
    } else {
      loadCharts();
    }
  }, [last14Days, weeklyComparison, monthlyTrend, analyticsData, thisWeekData]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── ROW 1: KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-2"><Scissors size={14} className="text-blue-500"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today's cutting</p></div>
          <p className="text-2xl font-black text-slate-900">{todaySqFt.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ft²</span></p>
          <TrendBadge value={todayVsYesterday} />
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-2"><Clock size={14} className="text-indigo-500"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">This week</p></div>
          <p className="text-2xl font-black text-slate-900">{thisWeekData.total.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ft²</span></p>
          <TrendBadge value={weekVsWeek} />
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-2"><TrendingUp size={14} className="text-emerald-500"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">This month</p></div>
          <p className="text-2xl font-black text-slate-900">{thisMonthData.total.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ft²</span></p>
          <TrendBadge value={monthVsMonth} />
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-2"><Scissors size={14} className="text-amber-500"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily avg (week)</p></div>
          <p className="text-2xl font-black text-blue-600">{thisWeekData.avg.toLocaleString()} <span className="text-xs text-slate-400 font-normal">ft²/day</span></p>
          <p className="text-[10px] text-slate-400 font-bold">Month avg: {thisMonthData.avg.toLocaleString()} ft²</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-2"><Truck size={14} className="text-rose-500"/><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending</p></div>
          <p className="text-2xl font-black text-slate-900">{pendingJobs} <span className="text-xs text-slate-400 font-normal">jobs</span></p>
          <p className="text-[10px] text-slate-400 font-bold">{pendingPieces} pieces total</p>
        </div>
      </div>

      {/* ── ROW 2: Daily Chart + Pipeline ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-black text-slate-700 uppercase tracking-tight mb-1">Daily cutting output</p>
          <p className="text-[10px] text-slate-400 font-bold mb-3">Last 14 working days — line shows daily ft², dotted = week average</p>
          <div className="flex flex-wrap gap-4 mb-3 text-[10px] text-slate-500 font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 rounded inline-block"></span> Daily ft²</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-400 rounded inline-block" style={{borderBottom: '1px dashed'}}></span> Avg ({thisWeekData.avg} ft²)</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '220px' }}><canvas id="gc-daily-chart"></canvas></div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-black text-slate-700 uppercase tracking-tight mb-3">Production pipeline</p>
          <div style={{ position: 'relative', width: '100%', height: '180px' }}><canvas id="gc-pipeline-chart"></canvas></div>
          <div className="grid grid-cols-2 gap-2 mt-4 text-[9px] font-bold">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block"></span><span className="text-slate-500">Cut/Pending {analyticsData.cut}</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block"></span><span className="text-slate-500">QC {analyticsData.qcPassed}</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background:'#7F77DD'}}></span><span className="text-slate-500">Tempered {analyticsData.tempered}</span></div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block"></span><span className="text-slate-500">Delivered {analyticsData.delivered}</span></div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Weekly + Monthly ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-black text-slate-700 uppercase tracking-tight mb-1">Weekly comparison</p>
          <p className="text-[10px] text-slate-400 font-bold mb-3">This week vs last week — day by day</p>
          <div className="flex flex-wrap gap-4 mb-3 text-[10px] text-slate-500 font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 rounded inline-block"></span> This week</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-200 rounded inline-block"></span> Last week</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '200px' }}><canvas id="gc-weekly-chart"></canvas></div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-black text-slate-700 uppercase tracking-tight mb-1">Monthly trend</p>
          <p className="text-[10px] text-slate-400 font-bold mb-3">Last 6 months — total ft² + breakage rate</p>
          <div className="flex flex-wrap gap-4 mb-3 text-[10px] text-slate-500 font-bold">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 rounded inline-block"></span> Total ft²</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-rose-500 rounded inline-block"></span> Breakage %</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '200px' }}><canvas id="gc-monthly-chart"></canvas></div>
        </div>
      </div>

      {/* ── ROW 4: Quick Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Week avg/day</p>
          <p className="text-xl font-black text-slate-900">{thisWeekData.avg.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">ft²</span></p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Month avg/day</p>
          <p className="text-xl font-black text-slate-900">{thisMonthData.avg.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">ft²</span></p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Breakage rate</p>
          <p className="text-xl font-black text-rose-600">{analyticsData.defects > 0 ? ((analyticsData.defects / (analyticsData.total || 1)) * 100).toFixed(1) : '0'}%</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dispatch backlog</p>
          <p className="text-xl font-black text-amber-600">{dispatchBacklog} <span className="text-[10px] text-slate-400 font-normal">pieces</span></p>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
