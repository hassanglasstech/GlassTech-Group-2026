import React, { useState } from 'react';
import { CheckCircle2, X, Loader2, Edit2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { TOOL_LABELS, executeTool } from './agentTools';
import { useAuthStore } from '@/modules/auth/authStore';

interface ToolCall {
  id:     string;
  name:   string;
  params: Record<string, any>;
}

interface Props {
  toolCalls: ToolCall[];
  onAllDone: (results: Record<string, any>) => void;
  onReject:  () => void;
}

const RISK_COLOR = { low: 'border-green-500/30 bg-green-500/5', medium: 'border-yellow-500/30 bg-yellow-500/5', high: 'border-red-500/30 bg-red-500/5' };
const RISK_BADGE = { low: 'bg-green-500/20 text-green-400', medium: 'bg-yellow-500/20 text-yellow-400', high: 'bg-red-500/20 text-red-400' };

const ConfirmationCard: React.FC<Props> = ({ toolCalls, onAllDone, onReject }) => {
  const { user }                      = useAuthStore();
  const [executing, setExecuting]     = useState(false);
  const [done, setDone]               = useState(false);
  const [results, setResults]         = useState<Record<string, any>>({});
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [editId, setEditId]           = useState<string | null>(null);
  const [editParams, setEditParams]   = useState<Record<string, any>>({});
  const [expanded, setExpanded]       = useState<string | null>(toolCalls[0]?.id ?? null);

  const allTool = toolCalls.map(tc => ({
    ...tc,
    meta: TOOL_LABELS[tc.name] ?? { label: tc.name, icon: '🔧', risk: 'low' as const },
  }));

  const startEdit = (tc: ToolCall) => {
    setEditId(tc.id);
    setEditParams({ ...tc.params });
  };

  const approveAll = async () => {
    setExecuting(true);
    const newResults: Record<string, any> = {};
    const newErrors:  Record<string, string> = {};

    for (const tc of toolCalls) {
      const params = editId === tc.id ? editParams : tc.params;
      const res = await executeTool(tc.name, params, user?.fullName || 'Hassan');
      if (res.success) newResults[tc.id] = res.result;
      else             newErrors[tc.id]  = res.error || 'Failed';
    }

    setResults(newResults);
    setErrors(newErrors);
    setExecuting(false);
    setDone(true);
    onAllDone(newResults);
  };

  if (done) {
    const successCount = Object.keys(results).length;
    const failCount    = Object.keys(errors).length;
    return (
      <div className="bg-slate-800 rounded-2xl p-4 border border-green-500/20 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-400" />
          <span className="font-bold text-white text-sm">
            {successCount} action{successCount > 1 ? 's' : ''} executed
            {failCount > 0 && ` · ${failCount} failed`}
          </span>
        </div>
        {Object.entries(results).map(([id, res]) => {
          const tc = toolCalls.find(t => t.id === id)!;
          const meta = TOOL_LABELS[tc.name];
          return (
            <div key={id} className="text-xs text-slate-400 pl-6">
              {meta?.icon} {meta?.label}: {res?.req_id ? `REQ created` : res?.task_id ? `Task created` : res?.event_id ? `Event logged` : res?.message || '✓'}
            </div>
          );
        })}
        {Object.entries(errors).map(([id, err]) => {
          const tc = toolCalls.find(t => t.id === id)!;
          return <div key={id} className="text-xs text-red-400 pl-6">❌ {tc.name}: {err}</div>;
        })}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-blue-500/20 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">
          Agent — {toolCalls.length} action{toolCalls.length > 1 ? 's' : ''} proposed
        </span>
      </div>

      {/* Tool cards */}
      <div className="divide-y divide-slate-700/50">
        {allTool.map(tc => (
          <div key={tc.id} className={`${RISK_COLOR[tc.meta.risk]}`}>
            <button
              onClick={() => setExpanded(expanded === tc.id ? null : tc.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-lg shrink-0">{tc.meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">{tc.meta.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${RISK_BADGE[tc.meta.risk]}`}>
                    {tc.meta.risk} risk
                  </span>
                </div>
              </div>
              {expanded === tc.id ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
            </button>

            {expanded === tc.id && (
              <div className="px-4 pb-3 space-y-2">
                {/* Params display */}
                {editId === tc.id ? (
                  <div className="space-y-2">
                    {Object.entries(editParams).map(([key, val]) => (
                      <div key={key}>
                        <label className="text-[10px] text-slate-400 uppercase tracking-widest">{key}</label>
                        <input
                          value={String(val)}
                          onChange={e => setEditParams(p => ({ ...p, [key]: e.target.value }))}
                          className="w-full bg-slate-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none mt-0.5"
                        />
                      </div>
                    ))}
                    <button onClick={() => setEditId(null)} className="text-xs text-blue-400 hover:text-blue-300">Done editing</button>
                  </div>
                ) : (
                  <div className="bg-slate-800/60 rounded-xl p-3 space-y-1">
                    {Object.entries(tc.params).map(([key, val]) => (
                      <div key={key} className="flex gap-2 text-xs">
                        <span className="text-slate-500 shrink-0 capitalize">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-slate-200">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => startEdit(tc)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
                  <Edit2 size={11} /> Edit params
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 p-3 border-t border-slate-700/50">
        <button
          onClick={approveAll}
          disabled={executing}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          {executing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {executing ? 'Executing...' : `Approve ${toolCalls.length > 1 ? 'All' : ''}`}
        </button>
        <button
          onClick={onReject}
          disabled={executing}
          className="px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-xl transition-all disabled:opacity-50"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};

export default ConfirmationCard;
