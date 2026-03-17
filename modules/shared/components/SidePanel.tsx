import React, { useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';

type PanelWidth = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: PanelWidth;
  children: React.ReactNode;
  footer?: React.ReactNode;
  badge?: string;
  badgeColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
}

const WIDTH_MAP: Record<PanelWidth, string> = {
  sm:   'w-full max-w-sm',
  md:   'w-full max-w-md',
  lg:   'w-full max-w-2xl',
  xl:   'w-full max-w-4xl',
  full: 'w-full',
};

const BADGE_COLORS: Record<string, string> = {
  blue:    'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber:   'bg-amber-100 text-amber-700',
  rose:    'bg-rose-100 text-rose-700',
  slate:   'bg-slate-100 text-slate-600',
};

export const SidePanel: React.FC<SidePanelProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  width = 'lg',
  children,
  footer,
  badge,
  badgeColor = 'blue',
}) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <React.Fragment>
      <div
        className={`fixed inset-0 z-[200] transition-all duration-300 ${isOpen ? 'bg-slate-900/40 backdrop-blur-sm pointer-events-auto' : 'bg-transparent pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full z-[201] ${WIDTH_MAP[width]} bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out no-print ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <ChevronRight size={14} className="text-slate-400" />
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-black uppercase tracking-tight text-slate-900 truncate">
                  {title}
                </h2>
                {badge && (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${BADGE_COLORS[badgeColor]}`}>
                    {badge}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </React.Fragment>
  );
};

export default SidePanel;
