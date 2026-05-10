/**
 * FilterChips — Sprint 15
 *
 * Toggleable chips for Job / Date / Mm / Vendor / Status. Each chip is a
 * dropdown menu that emits the selected value upward; the parent owns the
 * filter state (so URL serialisation lives in one place).
 *
 * Active chips have coloured fills; inactive have a subtle "Add filter"
 * style. Clearing an active chip resets it to the parent's "all" sentinel.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X, Filter, Calendar, Briefcase, Ruler, Truck, Activity } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

export interface WorkbenchFilters {
  job:     string;        // 'all' | order_id
  date:    string;        // 'today' | 'week' | 'month' | 'all'
  mm:      string;        // 'all' | '6' | '8' | '10' | '12'
  vendor:  string;        // 'all' | vendor_name
  status:  string;        // 'all' | piece_status
}

export const DEFAULT_FILTERS: WorkbenchFilters = {
  job:    'all',
  date:   'all',
  mm:     'all',
  vendor: 'all',
  status: 'all',
};

interface FilterChipsProps {
  filters:        WorkbenchFilters;
  onChange:       (next: WorkbenchFilters) => void;
  jobOptions?:    Array<{ value: string; label: string }>;
  vendorOptions?: Array<{ value: string; label: string }>;
  statusOptions?: Array<{ value: string; label: string }>;
}

// ── Static option lists ──────────────────────────────────────────────

const DATE_OPTS = [
  { value: 'all',   label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This week' },
  { value: 'month', label: 'This month' },
];

const MM_OPTS = [
  { value: 'all', label: 'Any mm' },
  { value: '4',   label: '4 mm' },
  { value: '5',   label: '5 mm' },
  { value: '6',   label: '6 mm' },
  { value: '8',   label: '8 mm' },
  { value: '10',  label: '10 mm' },
  { value: '12',  label: '12 mm' },
];

// ── Single-chip component ────────────────────────────────────────────

interface ChipProps {
  icon:    React.ReactNode;
  label:   string;
  value:   string;
  options: Array<{ value: string; label: string }>;
  onSelect: (v: string) => void;
}

const Chip: React.FC<ChipProps> = ({ icon, label, value, options, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = value !== 'all';
  const current  = options.find(o => o.value === value);
  const display  = isActive && current ? current.label : label;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold
          transition-colors border
          ${isActive
            ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}
        `}
      >
        {icon}
        <span>{display}</span>
        {isActive ? (
          <span
            role="button"
            aria-label={`Clear ${label}`}
            onClick={e => { e.stopPropagation(); onSelect('all'); }}
            className="ml-0.5 rounded-full hover:bg-blue-800/30 p-0.5"
          >
            <X size={10}/>
          </span>
        ) : (
          <ChevronDown size={11}/>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-lg shadow-xl border border-slate-200 min-w-[180px] py-1 max-h-64 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSelect(opt.value); setOpen(false); }}
              className={`
                block w-full text-left px-3 py-1.5 text-xs
                ${value === opt.value ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'}
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────

const FilterChips: React.FC<FilterChipsProps> = ({
  filters,
  onChange,
  jobOptions    = [],
  vendorOptions = [],
  statusOptions = [],
}) => {
  const update = (k: keyof WorkbenchFilters) => (v: string) =>
    onChange({ ...filters, [k]: v });

  const activeCount = (Object.keys(filters) as Array<keyof WorkbenchFilters>)
    .filter(k => filters[k] !== 'all').length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip
        icon={<Briefcase size={11}/>}
        label="Job"
        value={filters.job}
        options={[{ value: 'all', label: 'All jobs' }, ...jobOptions]}
        onSelect={update('job')}
      />
      <Chip
        icon={<Calendar size={11}/>}
        label="Date"
        value={filters.date}
        options={DATE_OPTS}
        onSelect={update('date')}
      />
      <Chip
        icon={<Ruler size={11}/>}
        label="Mm"
        value={filters.mm}
        options={MM_OPTS}
        onSelect={update('mm')}
      />
      <Chip
        icon={<Truck size={11}/>}
        label="Vendor"
        value={filters.vendor}
        options={[{ value: 'all', label: 'All vendors' }, ...vendorOptions]}
        onSelect={update('vendor')}
      />
      <Chip
        icon={<Activity size={11}/>}
        label="Status"
        value={filters.status}
        options={[{ value: 'all', label: 'All statuses' }, ...statusOptions]}
        onSelect={update('status')}
      />

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 px-2 py-1"
        >
          <Filter size={11}/>
          Clear all ({activeCount})
        </button>
      )}
    </div>
  );
};

export default FilterChips;
