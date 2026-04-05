/**
 * ProductionFloorPlanner.tsx -- GlassCo Phase 2 (Enhanced)
 *
 * Features:
 *   - 3 physical Cutting Tables (CT-1, CT-2, CT-3) + Processing + Dispatch
 *   - Real order queue from ProductionService + job orders
 *   - Drag-drop team assignment across all 5 stations
 *   - Order assignment to specific cutting tables
 *   - Shift simulation with real sqft throughput
 *   - localStorage persistence
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { HRService } from '@/modules/hr/services/hrService';
import { ProductionService } from '@/modules/production/services/productionService';
import { SalesService } from '@/modules/sales/services/salesService';
import { useAppStore } from '@/modules/shared/store/appStore';
import {
  Scissors, Flame, Truck, Users, Plus, X, GripVertical,
  Clock, BarChart2, Play, Pause, RotateCcw, ChevronDown,
  ChevronUp, AlertCircle, CheckCircle2, Zap, Trash2,
  ListOrdered, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────

type StationId = 'ct1' | 'ct2' | 'ct3' | 'processing' | 'dispatch';

interface TeamMember {
  employeeId: string;
  name: string;
  designation: string;
  role: 'Lead' | 'Helper';
}

interface Team {
  id: string;
  name: string;
  station: StationId;
  members: TeamMember[];
  color: string;
  targetSqftPerHour: number;
  isActive: boolean;
  shiftStart: string;
  shiftEnd: string;
}

interface QueueOrder {
  orderId: string;
  orderNo: string;
  clientName: string;
  dueDate: string;
  totalPieces: number;
  pendingPieces: number;
  totalSqft: number;
  assignedTable?: StationId;  // which cutting table
  priority: 'URGENT' | 'NORMAL' | 'LOW';
  isOverdue: boolean;
}

interface StationConfig {
  id: StationId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
  isCuttingTable: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TEAM_KEY  = 'glassco_floor_planner_teams_v2';
const ORDER_KEY = 'glassco_floor_planner_orders';

const TEAM_COLORS = ['blue','emerald','violet','amber','rose','cyan','orange','teal'];

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  blue:    { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', badge: '#2563EB' },
  emerald: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0', badge: '#059669' },
  violet:  { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE', badge: '#7C3AED' },
  amber:   { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', badge: '#D97706' },
  rose:    { bg: '#FFF1F2', text: '#9F1239', border: '#FECDD3', badge: '#E11D48' },
  cyan:    { bg: '#ECFEFF', text: '#155E75', border: '#A5F3FC', badge: '#0891B2' },
  orange:  { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA', badge: '#EA580C' },
  teal:    { bg: '#F0FDFA', text: '#134E4A', border: '#99F6E4', badge: '#0D9488' },
};

const STATIONS: StationConfig[] = [
  { id: 'ct1', label: 'Cutting Table 1', shortLabel: 'CT-1', icon: <Scissors size={16} />, color: '#1D4ED8', bgColor: '#EFF6FF', borderColor: '#BFDBFE', accentColor: '#2563EB', isCuttingTable: true },
  { id: 'ct2', label: 'Cutting Table 2', shortLabel: 'CT-2', icon: <Scissors size={16} />, color: '#5B21B6', bgColor: '#F5F3FF', borderColor: '#DDD6FE', accentColor: '#7C3AED', isCuttingTable: true },
  { id: 'ct3', label: 'Cutting Table 3', shortLabel: 'CT-3', icon: <Scissors size={16} />, color: '#065F46', bgColor: '#ECFDF5', borderColor: '#A7F3D0', accentColor: '#059669', isCuttingTable: true },
  { id: 'processing', label: 'Processing',      shortLabel: 'PROC', icon: <Flame size={16} />, color: '#92400E', bgColor: '#FFFBEB', borderColor: '#FDE68A', accentColor: '#D97706', isCuttingTable: false },
  { id: 'dispatch',   label: 'Dispatch',         shortLabel: 'DISP', icon: <Truck size={16} />, color: '#134E4A', bgColor: '#F0FDFA', borderColor: '#99F6E4', accentColor: '#0D9488', isCuttingTable: false },
];

// ── Storage ───────────────────────────────────────────────────────────────

const loadTeams = (): Team[] => { try { return JSON.parse(localStorage.getItem(TEAM_KEY) || '[]'); } catch { return []; } };
const saveTeams = (d: Team[]) => { try { localStorage.setItem(TEAM_KEY, JSON.stringify(d)); } catch {} };
const loadOrderAssignments = (): Record<string, StationId> => { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '{}'); } catch { return {}; } };
const saveOrderAssignments = (d: Record<string, StationId>) => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(d)); } catch {} };

// ── Helpers ───────────────────────────────────────────────────────────────

const genId = () => 'team_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

const calcETA = (sqft: number, teams: Team[]): string => {
  const rate = teams.reduce((s, t) => s + (t.isActive ? t.targetSqftPerHour : 0), 0);
  if (!rate || !sqft) return '--';
  const hrs = sqft / rate;
  return hrs < 1 ? Math.round(hrs * 60) + ' min' : hrs.toFixed(1) + ' hrs';
};

const daysBetween = (a: string, b: string) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

// ── Add Team Modal ────────────────────────────────────────────────────────

const AddTeamModal: React.FC<{
  onClose: () => void;
  onSave: (t: Team) => void;
  station: StationId;
  existing: string[];
  company: string;
}> = ({ onClose, onSave, station, existing, company }) => {
  const [name, setName] = useState('');
  const [sqft, setSqft] = useState(200);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [color, setColor] = useState(TEAM_COLORS.find(c => !existing.includes(c)) || 'blue');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [empSearch, setEmpSearch] = useState('');

  const employees = useMemo(() =>
    HRService.getEmployees().filter(e => e.company === company),
    [company]
  );

  const filtered = employees.filter(e =>
    !members.find(m => m.employeeId === e.id) &&
    (e.personal.name.toLowerCase().includes(empSearch.toLowerCase()) ||
     e.work.designation.toLowerCase().includes(empSearch.toLowerCase()))
  ).slice(0, 8);

  const addMember = (emp: any, role: 'Lead' | 'Helper') => {
    if (members.length >= 6) return;
    setMembers(p => [...p, {
      employeeId: emp.id,
      name: emp.personal.name,
      designation: emp.work.designation,
      role,
    }]);
    setEmpSearch('');
  };

  const save = () => {
    if (!name.trim()) return toast.error('Team name required');
    onSave({
      id: genId(), name: name.trim(), station, members, color,
      targetSqftPerHour: sqft, isActive: true, shiftStart: start, shiftEnd: end,
    });
  };

  const stConfig = STATIONS.find(s => s.id === station)!;
  const c = colorMap[color];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,.25)' }}>
        <div style={{ background: stConfig.accentColor, color: '#fff', padding: '20px 24px', borderRadius: '24px 24px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, textTransform: 'uppercase', letterSpacing: '.05em' }}>New Team</div>
            <div style={{ fontSize: 11, opacity: .8, marginTop: 2 }}>{stConfig.label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Team Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alpha Team"
                style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Target sqft/hr</label>
              <input type="number" value={sqft} onChange={e => setSqft(Number(e.target.value))} min={50}
                style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Shift Start</label>
              <input type="time" value={start} onChange={e => setStart(e.target.value)}
                style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Shift End</label>
              <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Color</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TEAM_COLORS.map(cl => {
                const cm = colorMap[cl];
                return <button key={cl} onClick={() => setColor(cl)}
                  style={{ width: 32, height: 32, borderRadius: 8, background: cm.badge, border: color === cl ? '3px solid #1E293B' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />;
              })}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Add Members ({members.length}/6)
            </label>
            <input placeholder="Search employee..." value={empSearch} onChange={e => setEmpSearch(e.target.value)}
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
            {empSearch && filtered.map(emp => (
              <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: '#F8FAFC', marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{emp.personal.name}</span>
                  <span style={{ fontSize: 11, color: '#64748B', marginLeft: 6 }}>{emp.work.designation}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => addMember(emp, 'Lead')} style={{ fontSize: 10, fontWeight: 800, background: stConfig.accentColor, color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Lead</button>
                  <button onClick={() => addMember(emp, 'Helper')} style={{ fontSize: 10, fontWeight: 800, background: '#E2E8F0', color: '#475569', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Helper</button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {members.map(m => (
                <div key={m.employeeId} style={{ display: 'flex', alignItems: 'center', gap: 5, background: c.bg, border: '1px solid ' + c.border, borderRadius: 20, padding: '4px 10px' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, background: c.badge, color: '#fff', borderRadius: 10, padding: '1px 5px' }}>{m.role}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{m.name}</span>
                  <button onClick={() => setMembers(p => p.filter(x => x.employeeId !== m.employeeId))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0, display: 'flex' }}><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
          <button onClick={save}
            style={{ background: stConfig.accentColor, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', letterSpacing: '.05em' }}>
            Create Team
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Team Card ─────────────────────────────────────────────────────────────

const TeamCard: React.FC<{
  team: Team;
  stationSqft: number;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
}> = ({ team, stationSqft, onToggle, onDelete, onDragStart }) => {
  const [expanded, setExpanded] = useState(false);
  const c = colorMap[team.color] || colorMap.blue;
  const lead = team.members.find(m => m.role === 'Lead');
  const helpers = team.members.filter(m => m.role === 'Helper');
  const eta = calcETA(stationSqft, [team]);

  return (
    <div draggable onDragStart={e => onDragStart(e, team.id)}
      style={{ background: c.bg, border: '1px solid ' + c.border, borderRadius: 16, overflow: 'hidden', cursor: 'grab', opacity: team.isActive ? 1 : .6 }}>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GripVertical size={14} color="#94A3B8" />
            <div>
              <div style={{ fontWeight: 900, fontSize: 13, color: c.text }}>{team.name}</div>
              <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{team.shiftStart} - {team.shiftEnd}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onToggle(team.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: team.isActive ? '#16A34A' : '#94A3B8' }}>
              {team.isActive ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            </button>
            <button onClick={() => setExpanded(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={() => onDelete(team.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span style={{ background: c.badge, color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={9} /> {team.members.length}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={9} /> {team.targetSqftPerHour} sqft/hr
          </span>
          {eta !== '--' && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={9} /> ETA {eta}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid ' + c.border }}>
          {lead && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ background: c.badge, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>Lead</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{lead.name}</span>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>{lead.designation}</span>
          </div>}
          {helpers.map(h => (
            <div key={h.employeeId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingLeft: 8 }}>
              <span style={{ background: '#E2E8F0', color: '#475569', borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>Helper</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{h.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Station Board ─────────────────────────────────────────────────────────

const StationBoard: React.FC<{
  config: StationConfig;
  teams: Team[];
  orders: QueueOrder[];
  onDrop: (e: React.DragEvent, id: StationId) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onAddTeam: (id: StationId) => void;
}> = ({ config, teams, orders, onDrop, onToggle, onDelete, onDragStart, onAddTeam }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const assignedOrders = config.isCuttingTable ? orders.filter(o => o.assignedTable === config.id) : [];
  const totalSqft = assignedOrders.reduce((s, o) => s + o.totalSqft, 0);
  const pieceCount = assignedOrders.reduce((s, o) => s + o.pendingPieces, 0);
  const etaStr = calcETA(totalSqft, teams.filter(t => t.isActive));

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { setIsDragOver(false); onDrop(e, config.id); }}
      style={{
        background: isDragOver ? config.bgColor : '#fff',
        border: '2px solid ' + (isDragOver ? config.borderColor : '#E2E8F0'),
        borderRadius: 24, minHeight: 420, display: 'flex', flexDirection: 'column',
        transition: 'all .2s', transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
      }}>
      {/* Header */}
      <div style={{ background: config.bgColor, borderBottom: '1px solid ' + config.borderColor, padding: '16px 18px', borderRadius: '22px 22px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: config.accentColor, color: '#fff', padding: 8, borderRadius: 12 }}>{config.icon}</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 13, color: config.color, textTransform: 'uppercase', letterSpacing: '.03em' }}>{config.label}</div>
              <div style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>{teams.length} team{teams.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <button onClick={() => onAddTeam(config.id)}
            style={{ background: config.accentColor, color: '#fff', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: config.isCuttingTable ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 8 }}>
          {config.isCuttingTable && (
            <div style={{ background: 'rgba(255,255,255,.7)', borderRadius: 12, padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Orders</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: config.color }}>{assignedOrders.length}</div>
            </div>
          )}
          <div style={{ background: 'rgba(255,255,255,.7)', borderRadius: 12, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Pieces</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: config.color }}>{pieceCount}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.7)', borderRadius: 12, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>ETA</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: config.color }}>{etaStr}</div>
          </div>
        </div>
        {/* Assigned orders mini list */}
        {config.isCuttingTable && assignedOrders.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {assignedOrders.slice(0, 3).map(o => (
              <div key={o.orderId} style={{ background: 'rgba(255,255,255,.8)', borderRadius: 8, padding: '5px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: config.color }}>{o.orderNo}</span>
                <span style={{ fontSize: 10, color: '#64748B' }}>{o.pendingPieces} pcs</span>
                {o.isOverdue && <span style={{ fontSize: 9, fontWeight: 800, background: '#FEE2E2', color: '#DC2626', borderRadius: 8, padding: '1px 5px' }}>LATE</span>}
              </div>
            ))}
            {assignedOrders.length > 3 && <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center' }}>+{assignedOrders.length - 3} more</div>}
          </div>
        )}
      </div>

      {/* Teams */}
      <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {teams.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #E2E8F0', borderRadius: 16, minHeight: 120 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#CBD5E1', textTransform: 'uppercase' }}>Drop team here</div>
          </div>
        ) : (
          teams.map(t => (
            <TeamCard key={t.id} team={t} stationSqft={totalSqft}
              onToggle={onToggle} onDelete={onDelete} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
};

// ── Order Queue Panel ─────────────────────────────────────────────────────

const OrderQueue: React.FC<{
  orders: QueueOrder[];
  onAssign: (orderId: string, table: StationId) => void;
}> = ({ orders, onAssign }) => {
  const [filter, setFilter] = useState<'all' | 'unassigned'>('unassigned');
  const filtered = filter === 'unassigned' ? orders.filter(o => !o.assignedTable) : orders;

  return (
    <div style={{ background: '#0F172A', borderRadius: 24, padding: 24, color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(245,158,11,.2)', padding: 8, borderRadius: 12 }}><ListOrdered size={18} color="#F59E0B" /></div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, textTransform: 'uppercase', letterSpacing: '.05em' }}>Order Queue</div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{orders.filter(o => !o.assignedTable).length} unassigned</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['unassigned','all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer', border: 'none', background: filter === f ? '#F59E0B' : 'rgba(255,255,255,.1)', color: filter === f ? '#fff' : '#94A3B8' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748B', fontSize: 13 }}>
            {filter === 'unassigned' ? 'All orders assigned to cutting tables' : 'No orders in queue'}
          </div>
        ) : filtered.map(order => (
          <div key={order.orderId} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 900, fontSize: 13 }}>{order.orderNo}</span>
                  {order.isOverdue && (
                    <span style={{ background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 8, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <AlertTriangle size={9} /> OVERDUE
                    </span>
                  )}
                  <span style={{ background: order.priority === 'URGENT' ? 'rgba(220,38,38,.3)' : order.priority === 'NORMAL' ? 'rgba(245,158,11,.2)' : 'rgba(100,116,139,.2)', color: order.priority === 'URGENT' ? '#FCA5A5' : order.priority === 'NORMAL' ? '#FDE68A' : '#94A3B8', fontSize: 9, fontWeight: 800, borderRadius: 8, padding: '1px 6px' }}>
                    {order.priority}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{order.clientName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{order.pendingPieces} pcs</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>Due: {order.dueDate || '--'}</div>
              </div>
            </div>
            {order.assignedTable ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#64748B' }}>Assigned:</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#86EFAC' }}>
                  {STATIONS.find(s => s.id === order.assignedTable)?.label}
                </span>
                <button onClick={() => onAssign(order.orderId, '' as StationId)}
                  style={{ marginLeft: 'auto', background: 'rgba(220,38,38,.2)', color: '#FCA5A5', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
                  Unassign
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#64748B', marginRight: 4, display: 'flex', alignItems: 'center' }}>
                  <ArrowRight size={11} style={{ marginRight: 3 }} />Assign to:
                </span>
                {(['ct1','ct2','ct3'] as StationId[]).map(t => {
                  const st = STATIONS.find(s => s.id === t)!;
                  return (
                    <button key={t} onClick={() => onAssign(order.orderId, t)}
                      style={{ background: st.accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
                      {st.shortLabel}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Simulation Panel ──────────────────────────────────────────────────────

const SimulationPanel: React.FC<{
  stations: StationConfig[];
  teamsByStation: Record<StationId, Team[]>;
  ordersByStation: Record<StationId, QueueOrder[]>;
}> = ({ stations, teamsByStation, ordersByStation }) => {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const [speed, setSpeed]       = useState(60);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (running) timer.current = setInterval(() => setElapsed(p => p + 1), speed);
    else clearInterval(timer.current);
    return () => clearInterval(timer.current);
  }, [running, speed]);

  const allTeams    = Object.values(teamsByStation).flat();
  const activeTeams = allTeams.filter(t => t.isActive);
  const totalCap    = activeTeams.reduce((s, t) => s + t.targetSqftPerHour, 0);

  const fmt = (s: number) => {
    const h = String(Math.floor(s / 3600)).padStart(2,'0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2,'0');
    const sc= String(s % 60).padStart(2,'0');
    return h + ':' + m + ':' + sc;
  };

  const cuttingStations = stations.filter(s => s.isCuttingTable);
  const otherStations   = stations.filter(s => !s.isCuttingTable);

  return (
    <div style={{ background: '#0F172A', color: '#fff', borderRadius: 24, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(16,185,129,.2)', padding: 10, borderRadius: 14 }}><Zap size={20} color="#10B981" /></div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, textTransform: 'uppercase', letterSpacing: '.05em' }}>Shift Simulation</div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{activeTeams.length} active teams -- {totalCap} sqft/hr total capacity</div>
          </div>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 900, color: '#10B981' }}>{fmt(elapsed)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Teams', value: allTeams.length, color: '#fff' },
          { label: 'Active', value: activeTeams.length, color: '#10B981' },
          { label: 'Capacity', value: totalCap + ' sqft/hr', color: '#60A5FA' },
          { label: 'Processed', value: Math.round(totalCap * elapsed / 3600) + ' sqft', color: '#FBBF24' },
        ].map(m => (
          <div key={m.label} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 16, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Cutting tables progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 10 }}>Cutting Tables</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {cuttingStations.map(st => {
            const ords = ordersByStation[st.id] || [];
            const sqft = ords.reduce((s, o) => s + o.totalSqft, 0);
            const rate = (teamsByStation[st.id] || []).filter(t => t.isActive).reduce((s, t) => s + t.targetSqftPerHour, 0);
            const done = Math.min(Math.round(rate * elapsed / 3600), sqft);
            const pct  = sqft > 0 ? Math.round(done / sqft * 100) : 0;
            return (
              <div key={st.id} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 14, padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: st.color }}>{st.shortLabel}</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: pct + '%', height: '100%', background: st.accentColor, borderRadius: 3, transition: 'width 1s' }} />
                </div>
                <div style={{ fontSize: 9, color: '#64748B', marginTop: 4 }}>{done} / {sqft} sqft</div>
              </div>
            );
          })}
        </div>
      </div>

      {otherStations.map(st => {
        const stTeams = (teamsByStation[st.id] || []).filter(t => t.isActive);
        const rate    = stTeams.reduce((s, t) => s + t.targetSqftPerHour, 0);
        const done    = Math.round(rate * elapsed / 3600);
        return (
          <div key={st.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase' }}>{st.label}</span>
              <span style={{ fontSize: 11, color: '#64748B' }}>{done.toLocaleString()} sqft processed</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: Math.min(done, 100) + '%', height: '100%', background: st.accentColor, borderRadius: 3, transition: 'width 1s' }} />
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button onClick={() => setRunning(p => !p)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: 'none', fontWeight: 900, fontSize: 13, cursor: 'pointer', background: running ? '#F59E0B' : '#10B981', color: '#fff' }}>
          {running ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Run Sim</>}
        </button>
        <button onClick={() => { setRunning(false); setElapsed(0); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,.1)', color: '#94A3B8' }}>
          <RotateCcw size={14} /> Reset
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Speed</span>
          {[120,60,30,10].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              style={{ padding: '5px 10px', borderRadius: 8, border: 'none', fontSize: 10, fontWeight: 800, cursor: 'pointer', background: speed === s ? '#fff' : 'rgba(255,255,255,.1)', color: speed === s ? '#0F172A' : '#64748B' }}>
              {s === 120 ? '0.5x' : s === 60 ? '1x' : s === 30 ? '2x' : '6x'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────

const ProductionFloorPlanner: React.FC = () => {
  const company = useAppStore(s => s.selectedCompany);
  const [teams, setTeams] = useState<Team[]>(() => loadTeams());
  const [orderAssignments, setOrderAssignments] = useState<Record<string, StationId>>(() => loadOrderAssignments());
  const [addModalStation, setAddModalStation] = useState<StationId | null>(null);
  const draggingId = useRef<string | null>(null);

  useEffect(() => { saveTeams(teams); }, [teams]);
  useEffect(() => { saveOrderAssignments(orderAssignments); }, [orderAssignments]);

  // ── Build real order queue ───────────────────────────────────────
  const orderQueue = useMemo((): QueueOrder[] => {
    const jobOrders = ProductionService.getJobOrders().filter((o: any) =>
      o.company === company &&
      ['Approved', 'Sent', 'Partial Payment'].includes(o.status || '') &&
      !o.isAlreadyDispatched
    );
    const pieces = ProductionService.getProductionPieces();
    const clients = SalesService.getClients ? SalesService.getClients() : [];
    const today = new Date().toISOString().slice(0, 10);

    return jobOrders.map((o: any): QueueOrder => {
      const orderPieces = pieces.filter((p: any) => p.orderId === o.id);
      const pendingPieces = orderPieces.filter((p: any) =>
        !['Dispatched','Delivered','QC-Passed','Ready to Dispatch'].includes(p.status || '')
      ).length;
      const totalPieces = orderPieces.length || (o.items || []).reduce((s: number, i: any) => s + (i.qty || 1), 0);
      const totalSqft   = (o.items || []).reduce((s: number, i: any) => s + (i.totalSqFt || 0), 0);
      const client      = clients.find((c: any) => c.id === o.clientId);
      const dueDate     = o.reqDate || o.dueDate || '';
      const isOverdue   = !!dueDate && dueDate < today;
      const daysLeft    = dueDate ? daysBetween(today, dueDate) : 999;

      return {
        orderId:       o.id,
        orderNo:       o.orderNo || o.manualSerial || o.id,
        clientName:    client?.name || o.architect || 'Unknown',
        dueDate,
        totalPieces,
        pendingPieces: pendingPieces || totalPieces,
        totalSqft:     Math.round(totalSqft * 10) / 10,
        assignedTable: orderAssignments[o.id],
        priority:      isOverdue || daysLeft <= 2 ? 'URGENT' : daysLeft <= 7 ? 'NORMAL' : 'LOW',
        isOverdue,
      };
    }).filter(o => o.totalPieces > 0);
  }, [company, orderAssignments]);

  const teamsByStation = useMemo<Record<StationId, Team[]>>(() => ({
    ct1:        teams.filter(t => t.station === 'ct1'),
    ct2:        teams.filter(t => t.station === 'ct2'),
    ct3:        teams.filter(t => t.station === 'ct3'),
    processing: teams.filter(t => t.station === 'processing'),
    dispatch:   teams.filter(t => t.station === 'dispatch'),
  }), [teams]);

  const ordersByStation = useMemo<Record<StationId, QueueOrder[]>>(() => ({
    ct1:        orderQueue.filter(o => o.assignedTable === 'ct1'),
    ct2:        orderQueue.filter(o => o.assignedTable === 'ct2'),
    ct3:        orderQueue.filter(o => o.assignedTable === 'ct3'),
    processing: orderQueue.filter(o => o.assignedTable === 'processing'),
    dispatch:   orderQueue.filter(o => o.assignedTable === 'dispatch'),
  }), [orderQueue]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    draggingId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stationId: StationId) => {
    e.preventDefault();
    const id = draggingId.current;
    if (!id) return;
    setTeams(prev => prev.map(t => t.id === id ? { ...t, station: stationId } : t));
    draggingId.current = null;
    const st = STATIONS.find(s => s.id === stationId);
    toast.success('Team moved to ' + (st?.label || stationId));
  }, []);

  const handleAssignOrder = useCallback((orderId: string, table: StationId) => {
    setOrderAssignments(prev => {
      const next = { ...prev };
      if (!table) delete next[orderId];
      else next[orderId] = table;
      return next;
    });
  }, []);

  const totalUnassigned = orderQueue.filter(o => !o.assignedTable).length;
  const urgentCount     = orderQueue.filter(o => o.priority === 'URGENT').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif', padding: '4px 0' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1E293B, #334155)', color: '#fff', padding: '24px 28px', borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-.02em' }}>Production Floor Planner</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            GlassCo -- 3 Cutting Tables -- Drag Teams -- Live Simulation
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Teams', value: teams.length },
            { label: 'Active', value: teams.filter(t => t.isActive).length, color: '#10B981' },
            { label: 'In Queue', value: orderQueue.length },
            { label: 'Unassigned', value: totalUnassigned, color: totalUnassigned > 0 ? '#F59E0B' : '#10B981' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 16, padding: '10px 18px', textAlign: 'center', border: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color || '#fff', marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cutting Tables: 3 columns */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          <Scissors size={13} style={{ display: 'inline', marginRight: 6 }} />
          Cutting Tables -- Assign teams and orders
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {STATIONS.filter(s => s.isCuttingTable).map(st => (
            <StationBoard key={st.id} config={st}
              teams={teamsByStation[st.id]}
              orders={ordersByStation[st.id]}
              onDrop={handleDrop}
              onToggle={id => setTeams(p => p.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t))}
              onDelete={id => setTeams(p => p.filter(t => t.id !== id))}
              onDragStart={handleDragStart}
              onAddTeam={setAddModalStation}
            />
          ))}
        </div>
      </div>

      {/* Processing + Dispatch: 2 columns */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          <Flame size={13} style={{ display: 'inline', marginRight: 6 }} />
          Processing and Dispatch
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {STATIONS.filter(s => !s.isCuttingTable).map(st => (
            <StationBoard key={st.id} config={st}
              teams={teamsByStation[st.id]}
              orders={ordersByStation[st.id]}
              onDrop={handleDrop}
              onToggle={id => setTeams(p => p.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t))}
              onDelete={id => setTeams(p => p.filter(t => t.id !== id))}
              onDragStart={handleDragStart}
              onAddTeam={setAddModalStation}
            />
          ))}
        </div>
      </div>

      {/* Order Queue + Simulation: 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <OrderQueue orders={orderQueue} onAssign={handleAssignOrder} />
        <SimulationPanel stations={STATIONS} teamsByStation={teamsByStation} ordersByStation={ordersByStation} />
      </div>

      {/* Add Team Modal */}
      {addModalStation && (
        <AddTeamModal
          station={addModalStation}
          onClose={() => setAddModalStation(null)}
          onSave={team => { setTeams(p => [...p, team]); setAddModalStation(null); toast.success(team.name + ' created!'); }}
          existing={teams.map(t => t.color)}
          company={company}
        />
      )}
    </div>
  );
};

export default ProductionFloorPlanner;
