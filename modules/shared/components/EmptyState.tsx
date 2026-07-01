/**
 * EmptyState.tsx — the one way to render "nothing here yet".
 *
 * Replaces bare "No data" text. An empty list should orient the user and
 * offer the next action (Odoo/Fiori pattern). Use inside tables, cards, tabs.
 *
 *   <EmptyState icon={<Inbox/>} title="No requisitions match these filters"
 *     description="Try clearing filters, or create a new one."
 *     action={{ label: 'New Requisition', icon: <Plus size={14}/>, onClick: create }} />
 */

import React from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  /** Secondary (ghost) action shown next to the primary. */
  secondaryAction?: EmptyStateAction;
  /** Compact variant for small cards / inline slots. */
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon, title, description, action, secondaryAction, compact = false, className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center px-4 ${compact ? 'py-8' : 'py-16'} ${className}`}>
    {icon && (
      <div className={`rounded-full bg-info-subtle text-info flex items-center justify-center mb-3 ${compact ? 'h-10 w-10' : 'h-14 w-14'}`}>
        {icon}
      </div>
    )}
    <h3 className={`font-bold text-slate-800 ${compact ? 'text-body' : 'text-base'}`}>{title}</h3>
    {description && (
      <p className="text-body text-slate-500 mt-1 max-w-sm">{description}</p>
    )}
    {(action || secondaryAction) && (
      <div className="flex items-center gap-2 mt-4">
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-label font-bold rounded-control bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
          >
            {action.icon}{action.label}
          </button>
        )}
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-label font-bold rounded-control bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {secondaryAction.icon}{secondaryAction.label}
          </button>
        )}
      </div>
    )}
  </div>
);

export default EmptyState;
