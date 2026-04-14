import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryService } from '@/modules/procurement/services/inventoryService';
import { MapPin } from 'lucide-react';

interface LocationComboInputProps {
  company: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}

export const LocationComboInput: React.FC<LocationComboInputProps> = ({
  company, value, onChange, placeholder = 'e.g. A-01', className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const savedLocations = useMemo(
    () => InventoryService.getStockLocations(company),
    [company, value] // re-fetch when value changes (new location may have been added)
  );

  const filtered = useMemo(() => {
    if (!filter) return savedLocations;
    const q = filter.toLowerCase();
    return savedLocations.filter(l =>
      l.code.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q)
    );
  }, [savedLocations, filter]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (val: string) => {
    setFilter(val);
    onChange(val.toUpperCase());
    if (!isOpen) setIsOpen(true);
  };

  const handleSelect = (code: string) => {
    onChange(code);
    setFilter('');
    setIsOpen(false);
  };

  const handleBlur = () => {
    // Auto-register new location on blur if code is non-empty and not in list
    if (value && value.trim() && !savedLocations.some(l => l.code === value.toUpperCase())) {
      InventoryService.ensureLocation(company, value);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
        <input
          type="text"
          className="sap-input w-full pl-8 font-bold uppercase"
          placeholder={placeholder}
          value={value || ''}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
        />
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(loc => (
            <button
              key={loc.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-slate-50 last:border-0"
              onMouseDown={e => { e.preventDefault(); handleSelect(loc.code); }}
            >
              <div>
                <span className="text-xs font-black text-slate-800 uppercase">{loc.code}</span>
                {loc.description && <span className="text-[10px] text-slate-400 ml-2">{loc.description}</span>}
              </div>
              {loc.zone && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{loc.zone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
