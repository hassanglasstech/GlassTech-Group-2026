/**
 * ProductionFloorPlanner.tsx — GlassCo Phase 2
 * 
 * Production Floor Planner: drag-drop team assignment across 3 stations
 * (Cutting, Processing, Dispatch), queue management, and live simulation.
 * 
 * Features:
 * - 3 Station boards: Cutting Table | Processing Table | Dispatch Table
 * - Team cards draggable between stations
 * - Queue load per station (pieces count)
 * - Simulation mode: estimated completion time per station
 * - localStorage persistence for team assignments
 * - Employee picker from HRService
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { HRService } from '@/modules/hr/services/hrService';
import { useAppStore } from '@/modules/shared/store/appStore';
import { Scissors, Flame, Truck, Users, Plus, X, GripVertical, 
         Clock, BarChart2, Play, Pause, RotateCcw, ChevronDown,
         ChevronUp, AlertCircle, CheckCircle2, Zap, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

type StationId = 'cutting' | 'processing' | 'dispatch';

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
  shiftStart: string; // HH:MM
  shiftEnd: string;
}

interface StationStats {
  id: StationId;
  label: string;
  queueCount: number;
  totalSqft: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  accentColor: string;
}

const STORAGE_KEY = 'glassco_floor_planner_teams';

const TEAM_COLORS = [
  'blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'orange', 'teal'
];

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    badge: 'bg-blue-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-600' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  badge: 'bg-violet-600' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   badge: 'bg-amber-600' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    badge: 'bg-rose-600' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    badge: 'bg-cyan-600' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  badge: 'bg-orange-600' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    badge: 'bg-teal-600' },
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const genId = () => `team_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const loadTeams = (): Team[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveTeams = (teams: Team[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(teams)); } catch {}
};

const calcETA = (sqft: number, teamsOnStation: Team[]): string => {
  const totalRate = teamsOnStation.reduce((s, t) => s + (t.isActive ? t.targetSqftPerHour : 0), 0);
  if (totalRate === 0 || sqft === 0) return '—';
  const hrs = sqft / totalRate;
  if (hrs < 1) return `${Math.round(hrs * 60)} min`;
  return `${hrs.toFixed(1)} hrs`;
};

// ─────────────────────────────────────────────────────────────────────
// Add Team Modal
// ─────────────────────────────────────────────────────────────────────

interface AddTeamModalProps {
  onClose: () => void;
  onSave: (team: Team) => void;
  station: StationId;
  existingColors: string[];
  company: string;
}

const AddTeamModal: React.FC<AddTeamModalProps> = ({ onClose, onSave, station, existingColors, company }) => {
  const [name, setName] = useState('');
  const [targetSqft, setTargetSqft] = useState(200);
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [selectedColor, setSelectedColor] = useState(() => {
    return TEAM_COLORS.find(c => !existingColors.includes(c)) || 'blue';
  });
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  const employees = useMemo(() => {
    try {
      return HRService.getEmployees().filter(e =>
        e.company === company &&
        (!e.work?.status || !['Resigned', 'Terminated'].includes(e.work.status as string))
      );
    } catch { return []; }
  }, [company]);

  const filtered = useMemo(() =>
    employees.filter(e =>
      e.personal.name.toLowerCase().includes(empSearch.toLowerCase()) &&
      !members.find(m => m.employeeId === e.id)
    ), [employees, empSearch, members]
  );

  const addMember = (emp: any, role: 'Lead' | 'Helper') => {
    setMembers(prev => [...prev, {
      employeeId: emp.id,
      name: emp.personal.name,
      designation: emp.work?.designation || '',
      role,
    }]);
    setShowEmpPicker(false);
    setEmpSearch('');
  };

  const removeMember = (empId: string) => {
    setMembers(prev => prev.filter(m => m.employeeId !== empId));
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Team name required'); return; }
    if (members.length === 0) { toast.error('Add at least 1 member'); return; }
    const team: Team = {
      id: genId(),
      name: name.trim(),
      station,
      members,
      color: selectedColor,
      targetSqftPerHour: targetSqft,
      isActive: true,
      shiftStart,
      shiftEnd,
    };
    onSave(team);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase">New Team</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5 capitalize">{station} Station</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Team name */}
          <div>
            <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">Team Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Team Alpha"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-2">Team Color</label>
            <div className="flex space-x-2 flex-wrap gap-y-2">
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${colorMap[c].badge} ${selectedColor === c ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                />
              ))}
            </div>
          </div>

          {/* Shift & Target */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">Shift Start</label>
              <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">Shift End</label>
              <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-1.5">Sqft/Hr</label>
              <input type="number" min={10} max={1000} value={targetSqft} onChange={e => setTargetSqft(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Members */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Members ({members.length})</label>
              <button onClick={() => setShowEmpPicker(true)}
                className="flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                <UserPlus size={14} /> <span>Add</span>
              </button>
            </div>

            {/* Employee picker */}
            {showEmpPicker && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 mb-3">
                <input
                  value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search employee..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filtered.slice(0, 10).map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 hover:border-blue-200 transition-colors">
                      <div>
                        <p className="text-xs font-bold text-slate-700">{emp.personal.name}</p>
                        <p className="text-[10px] text-slate-400">{emp.work?.designation || 'No designation'}</p>
                      </div>
                      <div className="flex space-x-1">
                        <button onClick={() => addMember(emp, 'Lead')}
                          className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded-lg uppercase">Lead</button>
                        <button onClick={() => addMember(emp, 'Helper')}
                          className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-black rounded-lg uppercase">Helper</button>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-3 italic">No employees found</p>
                  )}
                </div>
                <button onClick={() => setShowEmpPicker(false)} className="text-xs text-slate-400 hover:text-slate-600 mt-2 block">Cancel</button>
              </div>
            )}

            {/* Member list */}
            {members.length > 0 ? (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.employeeId} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${colorMap[selectedColor].bg} ${colorMap[selectedColor].border}`}>
                    <div>
                      <p className={`text-xs font-bold ${colorMap[selectedColor].text}`}>{m.name}</p>
                      <p className="text-[10px] text-slate-400">{m.role} · {m.designation || '—'}</p>
                    </div>
                    <button onClick={() => removeMember(m.employeeId)} className="text-slate-300 hover:text-rose-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-slate-300 text-xs italic border-2 border-dashed rounded-xl">
                No members yet — click Add
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end space-x-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-6 py-2.5 bg-slate-800 text-white text-sm font-black uppercase rounded-xl hover:bg-slate-700 transition-colors">
            Create Team
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Team Card
// ─────────────────────────────────────────────────────────────────────

interface TeamCardProps {
  team: Team;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, teamId: string) => void;
  eta: string;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, onToggleActive, onDelete, onDragStart, eta }) => {
  const [expanded, setExpanded] = useState(false);
  const c = colorMap[team.color] || colorMap.blue;
  const lead = team.members.find(m => m.role === 'Lead');
  const helpers = team.members.filter(m => m.role === 'Helper');

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, team.id)}
      className={`rounded-2xl border-2 transition-all select-none ${team.isActive ? `${c.bg} ${c.border}` : 'bg-slate-50 border-slate-200 opacity-60'} 
        cursor-grab active:cursor-grabbing hover:shadow-md group`}
    >
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <GripVertical size={16} className="text-slate-300 flex-shrink-0 group-hover:text-slate-400" />
            <div className="min-w-0">
              <p className={`text-sm font-black uppercase truncate ${team.isActive ? c.text : 'text-slate-400'}`}>
                {team.name}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">{team.shiftStart}–{team.shiftEnd} · {team.targetSqftPerHour} sqft/hr</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
            <button
              onClick={() => onToggleActive(team.id)}
              className={`p-1.5 rounded-lg transition-colors ${team.isActive ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
              title={team.isActive ? 'Mark Inactive' : 'Mark Active'}
            >
              {team.isActive ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            </button>
            <button onClick={() => setExpanded(p => !p)} className="p-1.5 rounded-lg hover:bg-white/60 transition-colors text-slate-400">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={() => onDelete(team.id)} className="p-1.5 rounded-lg hover:bg-rose-50 transition-colors text-slate-300 hover:text-rose-500">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center space-x-3 mt-3">
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-black ${c.badge} text-white`}>
            <Users size={10} /> <span>{team.members.length} members</span>
          </div>
          {eta !== '—' && (
            <div className="flex items-center space-x-1 text-[10px] font-bold text-slate-500">
              <Clock size={10} /> <span>ETA: {eta}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: member list */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/50 pt-3">
          {lead && (
            <div className="flex items-center space-x-2">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${c.badge} text-white`}>Lead</span>
              <span className="text-xs font-bold text-slate-700">{lead.name}</span>
              {lead.designation && <span className="text-[10px] text-slate-400">· {lead.designation}</span>}
            </div>
          )}
          {helpers.map(h => (
            <div key={h.employeeId} className="flex items-center space-x-2 pl-1">
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Helper</span>
              <span className="text-xs font-medium text-slate-600">{h.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Station Board
// ─────────────────────────────────────────────────────────────────────

interface StationBoardProps {
  station: StationStats;
  teams: Team[];
  onDrop: (e: React.DragEvent, stationId: StationId) => void;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, teamId: string) => void;
  onAddTeam: (stationId: StationId) => void;
}

const StationBoard: React.FC<StationBoardProps> = ({
  station, teams, onDrop, onToggleActive, onDelete, onDragStart, onAddTeam
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const activeTeams = teams.filter(t => t.isActive);
  const etaStr = calcETA(station.totalSqft, activeTeams);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => { setIsDragOver(false); onDrop(e, station.id); };

  return (
    <div
      className={`flex flex-col rounded-3xl border-2 transition-all min-h-[500px] ${isDragOver
        ? `${station.bgColor} ${station.borderColor} shadow-xl scale-[1.01]`
        : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Station Header */}
      <div className={`p-5 rounded-t-3xl ${station.bgColor} border-b ${station.borderColor}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${station.accentColor} text-white`}>
              {station.icon}
            </div>
            <div>
              <h3 className={`text-sm font-black uppercase ${station.color}`}>{station.label}</h3>
              <p className="text-[10px] text-slate-400 font-medium">{teams.length} team{teams.length !== 1 ? 's' : ''} assigned</p>
            </div>
          </div>
          <button
            onClick={() => onAddTeam(station.id)}
            className={`p-2 rounded-xl hover:opacity-80 transition-opacity ${station.accentColor} text-white`}
            title="Add team to this station"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400">Queue</p>
            <p className={`text-lg font-black ${station.color}`}>{station.queueCount}</p>
          </div>
          <div className="bg-white/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400">Sqft</p>
            <p className={`text-lg font-black ${station.color}`}>{station.totalSqft.toLocaleString()}</p>
          </div>
          <div className="bg-white/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400">ETA</p>
            <p className={`text-sm font-black ${station.color}`}>{etaStr}</p>
          </div>
        </div>
      </div>

      {/* Teams */}
      <div className="flex-1 p-4 space-y-3">
        {teams.length === 0 ? (
          <div className={`h-full flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-2xl transition-all ${isDragOver ? `${station.borderColor}` : 'border-slate-200'}`}>
            <p className="text-slate-300 text-xs font-black uppercase">Drop team here</p>
            <p className="text-slate-200 text-[10px] mt-1">or click + to add</p>
          </div>
        ) : (
          teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              onDragStart={onDragStart}
              eta={calcETA(station.totalSqft, team.isActive ? [team] : [])}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Simulation Panel
// ─────────────────────────────────────────────────────────────────────

interface SimPanelProps {
  stations: StationStats[];
  teamsByStation: Record<StationId, Team[]>;
}

const SimulationPanel: React.FC<SimPanelProps> = ({ stations, teamsByStation }) => {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds sim time
  const [simSpeed, setSimSpeed] = useState(60); // 1 sim-second = 60 real-ms
  const intervalRef = useRef<any>(null);

  const totalTeams = Object.values(teamsByStation).flat().length;
  const activeTeams = Object.values(teamsByStation).flat().filter(t => t.isActive).length;
  const totalCapacity = Object.values(teamsByStation).flat()
    .filter(t => t.isActive)
    .reduce((s, t) => s + t.targetSqftPerHour, 0);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed(p => p + 1);
      }, simSpeed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, simSpeed]);

  const reset = () => { setRunning(false); setElapsed(0); };

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 text-white rounded-3xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/20 rounded-xl">
            <Zap size={18} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase text-white">Shift Simulation</h3>
            <p className="text-[10px] text-slate-400">Real-time production throughput model</p>
          </div>
        </div>
        <div className="font-mono text-2xl font-black text-emerald-400">{formatElapsed(elapsed)}</div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white/5 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Total Teams</p>
          <p className="text-xl font-black text-white">{totalTeams}</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Active</p>
          <p className="text-xl font-black text-emerald-400">{activeTeams}</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Capacity</p>
          <p className="text-xl font-black text-blue-400">{totalCapacity}</p>
          <p className="text-[9px] text-slate-500">sqft/hr</p>
        </div>
        <div className="bg-white/5 rounded-2xl p-3 text-center">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Processed</p>
          <p className="text-xl font-black text-amber-400">
            {Math.round((totalCapacity * elapsed) / 3600).toLocaleString()}
          </p>
          <p className="text-[9px] text-slate-500">sqft sim</p>
        </div>
      </div>

      {/* Station progress bars */}
      <div className="space-y-3 mb-5">
        {stations.map(st => {
          const stTeams = (teamsByStation[st.id] || []).filter(t => t.isActive);
          const rate = stTeams.reduce((s, t) => s + t.targetSqftPerHour, 0);
          const processed = Math.min(Math.round((rate * elapsed) / 3600), st.totalSqft);
          const pct = st.totalSqft > 0 ? Math.round((processed / st.totalSqft) * 100) : 0;
          const colors: Record<StationId, string> = {
            cutting: 'bg-blue-500',
            processing: 'bg-amber-500',
            dispatch: 'bg-emerald-500',
          };
          return (
            <div key={st.id}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-black uppercase text-slate-400">{st.label}</span>
                <span className="text-[11px] font-bold text-slate-300">{processed.toLocaleString()} / {st.totalSqft.toLocaleString()} sqft ({pct}%)</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${colors[st.id]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setRunning(p => !p)}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-black text-sm transition-all ${
            running
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }`}
        >
          {running ? <><Pause size={16} /><span>Pause</span></> : <><Play size={16} /><span>Run Sim</span></>}
        </button>
        <button onClick={reset} className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 font-bold text-sm transition-all">
          <RotateCcw size={16} /> <span>Reset</span>
        </button>
        <div className="flex items-center space-x-2 ml-auto">
          <span className="text-[11px] text-slate-500 uppercase font-black">Speed</span>
          {[120, 60, 30, 10].map(spd => (
            <button
              key={spd}
              onClick={() => setSimSpeed(spd)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${simSpeed === spd ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}
            >
              {spd === 120 ? '0.5x' : spd === 60 ? '1x' : spd === 30 ? '2x' : '6x'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

interface ProductionFloorPlannerProps {
  /** Pass real queue counts + sqft from productionService or context */
  queueData?: {
    cutting: { count: number; sqft: number };
    processing: { count: number; sqft: number };
    dispatch: { count: number; sqft: number };
  };
}

const ProductionFloorPlanner: React.FC<ProductionFloorPlannerProps> = ({ queueData }) => {
  const company = useAppStore(s => s.selectedCompany);

  const [teams, setTeams] = useState<Team[]>(() => loadTeams());
  const [addModalStation, setAddModalStation] = useState<StationId | null>(null);
  const draggingTeamId = useRef<string | null>(null);

  // Persist on change
  useEffect(() => { saveTeams(teams); }, [teams]);

  // Queue data — use props if provided, else mock
  const queue = queueData || {
    cutting:    { count: 0, sqft: 0 },
    processing: { count: 0, sqft: 0 },
    dispatch:   { count: 0, sqft: 0 },
  };

  const stations: StationStats[] = [
    {
      id: 'cutting',
      label: 'Cutting Table',
      queueCount: queue.cutting.count,
      totalSqft: queue.cutting.sqft,
      icon: <Scissors size={18} />,
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      accentColor: 'bg-blue-600',
    },
    {
      id: 'processing',
      label: 'Processing Table',
      queueCount: queue.processing.count,
      totalSqft: queue.processing.sqft,
      icon: <Flame size={18} />,
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      accentColor: 'bg-amber-600',
    },
    {
      id: 'dispatch',
      label: 'Dispatch Table',
      queueCount: queue.dispatch.count,
      totalSqft: queue.dispatch.sqft,
      icon: <Truck size={18} />,
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      accentColor: 'bg-emerald-600',
    },
  ];

  const teamsByStation = useMemo<Record<StationId, Team[]>>(() => ({
    cutting:    teams.filter(t => t.station === 'cutting'),
    processing: teams.filter(t => t.station === 'processing'),
    dispatch:   teams.filter(t => t.station === 'dispatch'),
  }), [teams]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, teamId: string) => {
    draggingTeamId.current = teamId;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, stationId: StationId) => {
    e.preventDefault();
    const id = draggingTeamId.current;
    if (!id) return;
    setTeams(prev => prev.map(t => t.id === id ? { ...t, station: stationId } : t));
    draggingTeamId.current = null;
    toast.success(`Team moved to ${stationId}`);
  }, []);

  const handleToggleActive = useCallback((id: string) => {
    setTeams(prev => prev.map(t => t.id === id ? { ...t, isActive: !t.isActive } : t));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setTeams(prev => prev.filter(t => t.id !== id));
    toast.success('Team removed');
  }, []);

  const handleSaveTeam = useCallback((team: Team) => {
    setTeams(prev => [...prev, team]);
    setAddModalStation(null);
    toast.success(`${team.name} created!`);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Page Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-4 right-8"><BarChart2 size={120} /></div>
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl font-black uppercase tracking-tight">Production Floor Planner</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
            GlassCo · Drag teams between stations · Real-time simulation
          </p>
        </div>
        <div className="flex space-x-3 relative z-10">
          <div className="bg-white/10 px-5 py-3 rounded-2xl text-center border border-white/10">
            <p className="text-[10px] font-black uppercase text-slate-400">Teams</p>
            <p className="text-2xl font-black">{teams.length}</p>
          </div>
          <div className="bg-emerald-500/20 px-5 py-3 rounded-2xl text-center border border-emerald-500/20">
            <p className="text-[10px] font-black uppercase text-emerald-400">Active</p>
            <p className="text-2xl font-black text-emerald-400">{teams.filter(t => t.isActive).length}</p>
          </div>
        </div>
      </div>

      {/* 3-Column Station Boards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {stations.map(station => (
          <StationBoard
            key={station.id}
            station={station}
            teams={teamsByStation[station.id]}
            onDrop={handleDrop}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
            onDragStart={handleDragStart}
            onAddTeam={setAddModalStation}
          />
        ))}
      </div>

      {/* Simulation Panel */}
      <SimulationPanel stations={stations} teamsByStation={teamsByStation} />

      {/* Add Team Modal */}
      {addModalStation && (
        <AddTeamModal
          station={addModalStation}
          onClose={() => setAddModalStation(null)}
          onSave={handleSaveTeam}
          existingColors={teams.map(t => t.color)}
          company={company}
        />
      )}
    </div>
  );
};

export default ProductionFloorPlanner;
