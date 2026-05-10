/**
 * SearchBar — Sprint 15
 *
 * Debounced search input for the Production Workbench. Cmd+K (or Ctrl+K)
 * focuses the field globally — works from anywhere on the workbench page.
 *
 * Returns the trimmed value via onChange after a 150 ms debounce.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  /** ms before firing onChange. Default 150. */
  debounceMs?:  number;
  className?:   string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search piece, job, vendor… (⌘K)',
  debounceMs  = 150,
  className   = '',
}) => {
  const [local, setLocal]   = useState(value);
  const inputRef            = useRef<HTMLInputElement>(null);
  const timerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value → local (e.g., reset)
  useEffect(() => {
    if (value !== local) setLocal(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Debounce local → onChange
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (local.trim() !== value.trim()) onChange(local.trim());
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs]);

  // Cmd+K / Ctrl+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setLocal('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        aria-label="Search workbench"
      />
      {local && (
        <button
          type="button"
          onClick={() => { setLocal(''); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded"
          aria-label="Clear search"
        >
          <X size={14}/>
        </button>
      )}
    </div>
  );
};

export default SearchBar;
