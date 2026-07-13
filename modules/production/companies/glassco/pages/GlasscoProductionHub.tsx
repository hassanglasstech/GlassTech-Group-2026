/**
 * GlasscoProductionHub — the Glassco "Production" module landing/hub.
 *
 * Restores the standalone Glassco split of TWO production nav entries:
 *   • "Production Board"  → Workbench (the daily-driver kanban board)
 *   • "Production"        → this hub — one card per production function, each
 *                           routing to its existing screen.
 * (The multitenant migration had collapsed both into the Workbench.)
 *
 * A card launcher rather than nested tabs: the Workbench is a full-page `h-full`
 * app (own sticky header + kanban + lenses); nesting it in a tab shell fights its
 * layout. A launcher keeps every screen rendering exactly as designed. The
 * Workbench board is a separate top-level nav entry, so it is NOT repeated here.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/modules/shared/store/appStore';
import { hasFeature } from '@/modules/shared/services/featureFlagService';
import {
  ScanLine, ShieldCheck, Truck, Clock, BarChart3, AlertTriangle, ArrowRight, ClipboardList,
  Sparkles, Flame, Hammer, Drill, Users, PackageOpen,
} from 'lucide-react';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface ModuleCard {
  key: string;
  title: string;
  desc: string;
  path: string;
  icon: React.ReactNode;
  tone: Tone;
  feature?: string;   // optional feature-flag gate; hidden until enabled
}

// Static tone map so Tailwind generates the classes (no interpolation).
const TONE: Record<Tone, string> = {
  primary: 'bg-primary-subtle text-primary',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger:  'bg-danger-subtle text-danger',
  info:    'bg-info-subtle text-info',
  neutral: 'bg-neutral-subtle text-neutral',
};

interface ModuleSection {
  title: string;
  blurb: string;
  cards: ModuleCard[];
}

const SECTIONS: ModuleSection[] = [
  {
    title: 'Orders',
    blurb: 'Jobs on the floor',
    cards: [
      { key: 'job-orders', title: 'Job Orders', desc: 'Confirmed orders & live production progress', path: '/production/job-orders', icon: <ClipboardList size={20} />, tone: 'primary' },
    ],
  },
  {
    title: 'Floor Stations',
    blurb: 'Shop-floor data entry',
    cards: [
      { key: 'cut-sup',   title: 'Cutting Supervisor', desc: 'All benches · assign the pool & recuts',     path: '/production/cutting-supervisor', icon: <Users size={20} />,    tone: 'primary' },
      { key: 'cutter',    title: 'Cutter Workbench',   desc: 'Cutting sessions & sheet scan',             path: '/cutter',                     icon: <ScanLine size={20} />,    tone: 'info' },
      { key: 'service',   title: 'Service Floor',      desc: 'Mark polishing / grinding / notch / holes', path: '/production/service-floor',    icon: <Sparkles size={20} />,    tone: 'primary' },
      { key: 'qc',        title: 'QC Workbench',       desc: 'Quality control — pass / fail pieces',      path: '/qc',                         icon: <ShieldCheck size={20} />, tone: 'success' },
      { key: 'tempering', title: 'Tempering Dispatch', desc: 'Send QC-passed glass out to vendors',       path: '/production/tempering-dispatch', icon: <Flame size={20} />,       tone: 'warning' },
      { key: 'dispatch',  title: 'Dispatch',           desc: 'Ready-to-dispatch pieces & loading',        path: '/dispatch',                   icon: <Truck size={20} />,       tone: 'info' },
    ],
  },
  {
    title: 'Operator Stations',
    blurb: 'One screen per worker (magic-link them straight here)',
    cards: [
      { key: 'st-polish',    title: 'Polish Station',      desc: 'Polishing operator — mark polish done per piece', path: '/station/polish',    icon: <Sparkles size={20} />, tone: 'primary' },
      { key: 'st-grinding',  title: 'Grinding Station',    desc: 'Rough-dhar / R-D operator — mark grinding done',   path: '/station/grinding',  icon: <Hammer size={20} />,   tone: 'warning' },
      { key: 'st-holenotch', title: 'Hole & Notch Station', desc: 'Hole + notch operator — mark each done',           path: '/station/holenotch', icon: <Drill size={20} />,    tone: 'danger' },
    ],
  },
  {
    title: 'Tracking & Oversight',
    blurb: 'Monitor flow & performance',
    cards: [
      { key: 'service-pool', title: 'Out at Service Pool', desc: 'Batches at tempering / lamination / DG — returns & overdue', path: '/production/service-pool', icon: <PackageOpen size={20} />, tone: 'info', feature: 'dispatch.service_pool' },
      { key: 'guard', title: 'Gate Guard', desc: 'Verify gate passes before goods leave the premises', path: '/production/guard', icon: <ShieldCheck size={20} />, tone: 'primary', feature: 'dispatch.guard_screen' },
      { key: 'aging',       title: 'WIP Aging',          desc: 'Stuck pieces & tempering vendor SLA',     path: '/production/aging',             icon: <Clock size={20} />,     tone: 'warning' },
      { key: 'performance', title: 'Cutter Performance', desc: 'Sqft / hr, wastage & cutter leaderboard', path: '/production/cutter-performance', icon: <BarChart3 size={20} />, tone: 'neutral' },
    ],
  },
  {
    title: 'Quality',
    blurb: 'Non-conformance & claims',
    cards: [
      { key: 'ncr', title: 'NCR / Claims', desc: 'Non-conformance, reproductions & vendor claims', path: '/production/ncr-claims', icon: <AlertTriangle size={20} />, tone: 'danger' },
    ],
  },
];

const GlasscoProductionHub: React.FC = () => {
  const navigate = useNavigate();
  const company = useAppStore(s => s.selectedCompany);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Production</h1>
        <p className="text-label text-slate-500 mt-0.5">{company} · Glass cutting, tempering &amp; dispatch</p>
      </div>

      {SECTIONS.map(section => {
        const cards = section.cards.filter(c => !c.feature || hasFeature(c.feature));
        if (cards.length === 0) return null;
        return (
        <section key={section.title} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-label font-bold uppercase tracking-wide text-slate-600">{section.title}</h2>
            <span className="text-2xs text-slate-400">{section.blurb}</span>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(c => (
              <button
                key={c.key}
                onClick={() => navigate(c.path)}
                className="group flex items-start gap-4 rounded-card border border-slate-200 bg-white p-5 shadow-sm text-left hover:border-primary/40 hover:shadow transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className={`h-11 w-11 shrink-0 rounded-control flex items-center justify-center ${TONE[c.tone]}`}>
                  {c.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-body font-bold text-slate-900">{c.title}</h3>
                    <ArrowRight size={16} className="text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" aria-hidden />
                  </div>
                  <p className="text-label text-slate-500 mt-1 leading-snug">{c.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        );
      })}
    </div>
  );
};

export default GlasscoProductionHub;
