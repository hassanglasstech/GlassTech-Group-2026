import React from 'react';
import { TagService } from '../services/tagService';
import { TagMaster } from '../types/hr';

// ── Single Tag Pill ─────────────────────────────────────────────────
interface TagPillProps {
  tag: TagMaster;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export const TagPill: React.FC<TagPillProps> = ({ tag, onRemove, size = 'sm' }) => {
  const base = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-2.5 py-1 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold tracking-tight ${base}`}
      style={{ backgroundColor: tag.color, color: tag.textColor }}
    >
      {tag.label}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
          style={{ color: tag.textColor }}
          aria-label={`Remove ${tag.label}`}
        >
          ×
        </button>
      )}
    </span>
  );
};

// ── Employee Tag Pills (fetches and renders all tags for an employee) ─
interface EmployeeTagPillsProps {
  employeeId: string;
  size?: 'sm' | 'md';
  maxDisplay?: number;
}

export const EmployeeTagPills: React.FC<EmployeeTagPillsProps> = ({
  employeeId,
  size = 'sm',
  maxDisplay = 4,
}) => {
  const resolved = TagService.getEmployeeTagsResolved(employeeId);
  if (resolved.length === 0) return null;

  // Sort: primary first, then job_title before designation
  const sorted = [...resolved].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    if (a.tag.category === 'job_title' && b.tag.category === 'designation') return -1;
    if (a.tag.category === 'designation' && b.tag.category === 'job_title') return 1;
    return 0;
  });

  const visible = sorted.slice(0, maxDisplay);
  const overflow = sorted.length - maxDisplay;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map(et => (
        <TagPill key={et.id} tag={et.tag} size={size} />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          +{overflow}
        </span>
      )}
    </div>
  );
};

// ── Tag Selector (multi-select for forms) ───────────────────────────
interface TagSelectorProps {
  companyTags: TagMaster[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  category?: 'job_title' | 'designation' | 'all';
  label?: string;
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  companyTags,
  selectedTagIds,
  onChange,
  category = 'all',
  label,
}) => {
  const filtered = category === 'all'
    ? companyTags
    : companyTags.filter(t => t.category === category);

  const toggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200 min-h-[44px]">
        {filtered.map(tag => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
                isSelected
                  ? 'ring-2 ring-offset-1 ring-blue-400 scale-105'
                  : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                backgroundColor: tag.color,
                color: tag.textColor,
                borderColor: isSelected ? tag.textColor : 'transparent',
              }}
            >
              {tag.label}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-xs text-slate-400 italic">No tags available</span>
        )}
      </div>
    </div>
  );
};

export default TagPill;
