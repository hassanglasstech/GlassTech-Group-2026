// ═══════════════════════════════════════════════════════════════════
// EventOS Chat Widget — Staff message → Classify → Workflow/Query/Teach
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react';
import { Send, X, CheckCircle2, XCircle, Edit3, Loader2, AlertTriangle, Zap, Plus, Trash2, BookOpen, Undo2, Bell } from 'lucide-react';
import { processStaffMessage, executeWorkflow, recordFeedback, reverseExecution, getPreExecutionDecision, recordDecisionFeedback, recordDecisionOutcome, isDataQuery, isConversational, answerDataQuery, EventOSResult, QueryResult, DecisionRecommendation } from '../../services/eventOSService';
import { runAnomalyScan, acknowledgeAnomaly, Anomaly } from '../../services/anomalyDetectionService';
import { saveNewPattern } from '../agent/EventClassifier';
import { supabase } from '@/src/services/supabaseClient';
import { useAuthStore } from '@/modules/auth/authStore';

type WidgetState = 'idle' | 'classifying' | 'review' | 'executing' | 'done' | 'error' | 'query_answer' | 'teach_unknown';

const STEP_STATUS_COLORS: Record<string, string> = {
  ready:     'bg-green-500/10 border-green-500/30 text-green-400',
  pending:   'bg-slate-500/10 border-slate-500/30 text-slate-400',
  blocked:   'bg-red-500/10 border-red-500/30 text-red-400',
  completed: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  failed:    'bg-red-500/10 border-red-500/30 text-red-400',
};

const CATEGORIES = ['attendance', 'grn_inward', 'local_purchase', 'cash_expense', 'production_table_assign', 'ncr_breakage', 'delivery_update', 'vendor_payment', 'maintenance', 'hr', 'other'];
const MODULES = ['Purchase', 'Finance', 'Production', 'HR', 'Store', 'QC', 'Logistics', 'Sales', 'Maintenance'];

const EventOSChatWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [state, setState] = useState<WidgetState>('idle');
  const [result, setResult] = useState<EventOSResult | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [gapMode, setGapMode] = useState(false);
  const [gapText, setGapText] = useState('');
  const [queryAnswer, setQueryAnswer] = useState<QueryResult | null>(null);
  const [originalMessage, setOriginalMessage] = useState('');
  // Teach form state
  const [teachLabel, setTeachLabel] = useState('');
  const [teachCategory, setTeachCategory] = useState('other');
  const [teachModules, setTeachModules] = useState<string[]>([]);
  const [teachSteps, setTeachSteps] = useState<{ module: string; action: string }[]>([{ module: 'Purchase', action: '' }]);
  const [teachSaving, setTeachSaving] = useState(false);
  const [executionLogId, setExecutionLogId] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const [decision, setDecision] = useState<DecisionRecommendation | null>(null);
  const [alerts, setAlerts] = useState<Anomaly[]>([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore?.getState?.()?.user;

  // Scan for anomalies when chat opens
  useEffect(() => {
    if (open && alerts.length === 0 && !alertsDismissed) {
      runAnomalyScan().then(setAlerts).catch(() => {});
    }
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setOriginalMessage(text);
    setState('classifying');

    try {
      if (isConversational(text) || isDataQuery(text)) {
        const qr = await answerDataQuery(text);
        setQueryAnswer(qr);
        setState('query_answer');
      } else {
        const res = await processStaffMessage(text, 'text');
        setResult(res);
        // Fetch decision recommendation for action workflows
        if (res.classification.matched && res.workflow.steps.length > 0) {
          const dec = await getPreExecutionDecision(res.workflow);
          setDecision(dec);
        }
        // If unmatched → go to teach flow
        if (!res.classification.matched && res.workflow.steps.length === 0) {
          setTeachLabel(res.classification.label !== 'Unknown Event' ? res.classification.label : '');
          setTeachCategory(res.classification.category);
          setState('teach_unknown');
          // Log to unknown_log
          supabase.from('unknown_log').insert({
            original_message:   text,
            extracted_info:     res.classification.extracted,
            suggested_category: res.classification.category,
            status:             'pending',
          }).then(() => {}, () => {});
        } else {
          setState('review');
        }
      }
    } catch { setState('error'); }
  };

  const handleApprove = async () => {
    if (!result?.workflow) return;
    if (decision?.id) await recordDecisionFeedback(decision.id, 'followed');
    setState('executing');
    try {
      const exec = await executeWorkflow(result.workflow, user?.name || 'Owner');
      setExecutionResult(exec);
      setExecutionLogId(exec.executionLogId || null);
      setState('done');
    } catch { setState('error'); }
  };

  const handleReverse = async () => {
    if (!executionLogId) return;
    setReversing(true);
    const res = await reverseExecution(executionLogId, user?.name || 'Owner');
    setReversing(false);
    setExecutionResult({
      success: res.success,
      results: [{ message: res.success ? `Reversed — ${res.reversed} writes undone.` : 'Reversal partial.' }],
      errors: res.errors,
    });
    setExecutionLogId(null); // Can't reverse again
  };

  const handleReject = async () => {
    if (decision?.id) await recordDecisionFeedback(decision.id, 'overridden');
    if (result?.classification) {
      await recordFeedback(result.classification.pattern_id || '', result.workflow?.staff_message || '', result.classification.category, 'rejected');
    }
    reset();
  };

  // ── Teach: save new pattern ───────────────────────────────────
  const handleTeachSave = async () => {
    if (!teachLabel.trim()) return;
    setTeachSaving(true);

    // Extract keywords from original message (words > 2 chars, not stop words)
    const stopWords = new Set(['hai','ka','ki','ke','ko','ne','se','mein','pe','aur','ya','nahi','ho','hua','aaya']);
    const keywords = originalMessage.toLowerCase().split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 8);

    const eventId = `EVT-USR-${Date.now()}`;
    const steps = teachSteps.filter(s => s.action.trim()).map((s, i) => ({
      step: i + 1,
      module: s.module,
      action: s.action,
      tool: 'log_factory_event',
      fields: { sector: s.module, event_type: teachLabel, priority: 'Medium' },
      gl_flag: false,
      requires_approval: false,
    }));

    const ok = await saveNewPattern({
      event_id:         eventId,
      trigger_keywords: keywords,
      category:         teachCategory,
      label:            teachLabel,
      modules_involved: teachModules.length > 0 ? teachModules : [teachSteps[0]?.module || 'Other'],
      workflow_steps:   steps,
    });

    if (ok) {
      // Update unknown_log
      supabase.from('unknown_log').update({ status: 'defined', pattern_created_id: eventId })
        .eq('original_message', originalMessage).then(() => {}, () => {});
    }

    setTeachSaving(false);
    setState(ok ? 'done' : 'error');
    if (ok) setExecutionResult({ success: true, results: [{ message: `Pattern "${teachLabel}" saved. Next time auto-handle hoga.` }], errors: [] });
  };

  const reset = () => {
    setState('idle');
    setResult(null);
    setExecutionResult(null);
    setQueryAnswer(null);
    setGapMode(false);
    setGapText('');
    setOriginalMessage('');
    setTeachLabel('');
    setTeachCategory('other');
    setTeachModules([]);
    setTeachSteps([{ module: 'Purchase', action: '' }]);
    setExecutionLogId(null);
    setReversing(false);
    setDecision(null);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-transform z-50">
        <Zap size={24} className="text-white" />
        {alerts.length > 0 && !alertsDismissed && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{alerts.length}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-cyan-400" />
          <span className="font-bold text-white text-sm">EventOS</span>
        </div>
        <button onClick={() => { setOpen(false); reset(); }} className="text-slate-400 hover:text-white"><X size={16} /></button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {state === 'idle' && (
          <div className="space-y-3">
            <div className="text-center py-4">
              <Zap size={32} className="text-cyan-400 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Staff ka message likho</p>
              <p className="text-[10px] text-slate-600 mt-1">Query, action, ya naya event — sab handle hoga</p>
            </div>

            {/* Anomaly alerts */}
            {alerts.length > 0 && !alertsDismissed && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-orange-400 uppercase tracking-widest">
                    <Bell size={10} /> {alerts.length} Alert{alerts.length > 1 ? 's' : ''}
                  </div>
                  <button onClick={() => setAlertsDismissed(true)} className="text-[9px] text-slate-600 hover:text-slate-400">Dismiss all</button>
                </div>
                {alerts.slice(0, 4).map((a, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 ${
                    a.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                    a.severity === 'high'     ? 'bg-orange-500/10 border-orange-500/30' :
                    a.severity === 'medium'   ? 'bg-yellow-500/10 border-yellow-500/30' :
                    'bg-slate-500/10 border-slate-500/30'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`text-[9px] font-bold uppercase ${
                          a.severity === 'critical' ? 'text-red-400' :
                          a.severity === 'high'     ? 'text-orange-400' :
                          a.severity === 'medium'   ? 'text-yellow-400' : 'text-slate-400'
                        }`}>{a.severity} — {a.department}</span>
                        <p className="text-[10px] text-slate-300 mt-0.5">{a.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {state === 'classifying' && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={20} className="animate-spin text-cyan-400" />
            <span className="text-sm text-slate-400">Processing...</span>
          </div>
        )}

        {/* ── REVIEW: matched pattern ── */}
        {state === 'review' && result && (
          <>
            <div className="bg-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{result.classification.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  {Math.round(result.classification.confidence * 100)}%
                </span>
              </div>
              <p className="text-[10px] text-slate-500">{result.classification.reasoning}</p>
            </div>

            {/* Decision recommendation card */}
            {decision && (
              <div className={`rounded-xl border p-3 space-y-1.5 ${
                decision.decision === 'APPROVE' ? 'bg-green-500/5 border-green-500/20' :
                decision.decision === 'ESCALATE' ? 'bg-red-500/5 border-red-500/20' :
                'bg-yellow-500/5 border-yellow-500/20'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Agent Recommendation</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    decision.confidence >= 0.8 ? 'bg-green-500/20 text-green-400' :
                    decision.confidence >= 0.6 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{Math.round(decision.confidence * 100)}%</span>
                </div>
                <p className={`text-xs font-bold ${
                  decision.decision.includes('APPROVE') ? 'text-green-400' :
                  decision.decision === 'ESCALATE' ? 'text-red-400' : 'text-yellow-400'
                }`}>{decision.decision.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-slate-400">{decision.reasoning}</p>
                {decision.conditions.length > 0 && decision.conditions.map((c, i) => (
                  <p key={i} className="text-[10px] text-orange-300 pl-2 border-l border-orange-500/30">{c}</p>
                ))}
                {decision.similar_past.length > 0 && (
                  <p className="text-[9px] text-slate-600">{decision.similar_past.length} similar past decisions referenced</p>
                )}
              </div>
            )}

            {result.workflow.steps.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Workflow</div>
                {result.workflow.steps.map((step) => (
                  <div key={step.step} className={`rounded-lg border px-3 py-2 ${STEP_STATUS_COLORS[step.status]}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{step.step}. {step.module}</span>
                      {step.gl_flag && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">GL</span>}
                    </div>
                    <p className="text-[10px] mt-0.5 opacity-80">{step.action}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={handleApprove} disabled={!result.workflow.can_execute}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1">
                <CheckCircle2 size={14} /> Approve
              </button>
              <button onClick={handleReject}
                className="px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-bold py-2.5 rounded-xl">
                <XCircle size={14} />
              </button>
            </div>

            {!gapMode ? (
              <button onClick={() => setGapMode(true)} className="w-full text-[10px] text-slate-500 hover:text-orange-400 py-1 flex items-center justify-center gap-1">
                <Edit3 size={10} /> Report gap
              </button>
            ) : (
              <div className="space-y-2 bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                <input value={gapText} onChange={e => setGapText(e.target.value)} placeholder="Kya galat hai..." className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none" />
                <button onClick={() => { setGapMode(false); setGapText(''); }} className="w-full bg-orange-500/20 text-orange-300 text-[10px] font-bold py-1.5 rounded-lg">Submit</button>
              </div>
            )}
          </>
        )}

        {/* ── TEACH UNKNOWN: pattern definition form ── */}
        {state === 'teach_unknown' && (
          <div className="space-y-3">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen size={14} className="text-yellow-400" />
                <span className="text-xs font-bold text-yellow-300">Naya Event — Mujhe Sikhao</span>
              </div>
              <p className="text-[10px] text-slate-400">"{originalMessage}"</p>
              {result?.classification.category !== 'other' && (
                <p className="text-[10px] text-yellow-400 mt-1">Best guess: {result?.classification.category}</p>
              )}
            </div>

            {/* Label */}
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Event ka naam</label>
              <input value={teachLabel} onChange={e => setTeachLabel(e.target.value)}
                placeholder="e.g. Water Tanker, Tool Change..."
                className="w-full bg-slate-800 text-white text-xs px-3 py-2 rounded-lg outline-none placeholder-slate-600" />
            </div>

            {/* Category */}
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Category</label>
              <select value={teachCategory} onChange={e => setTeachCategory(e.target.value)}
                className="w-full bg-slate-800 text-white text-xs px-3 py-2 rounded-lg outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            {/* Modules */}
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Modules involved</label>
              <div className="flex flex-wrap gap-1">
                {MODULES.map(m => (
                  <button key={m} onClick={() => setTeachModules(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className={`text-[10px] px-2 py-1 rounded-lg border ${teachModules.includes(m) ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300' : 'border-slate-700 text-slate-500'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-500">Steps</label>
                <button onClick={() => setTeachSteps(prev => [...prev, { module: 'Purchase', action: '' }])}
                  className="text-[10px] text-cyan-400 flex items-center gap-0.5"><Plus size={10} /> Add</button>
              </div>
              {teachSteps.map((step, i) => (
                <div key={i} className="flex gap-1 mb-1.5">
                  <select value={step.module} onChange={e => { const s = [...teachSteps]; s[i].module = e.target.value; setTeachSteps(s); }}
                    className="bg-slate-800 text-white text-[10px] px-2 py-1.5 rounded-lg outline-none w-24">
                    {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input value={step.action} onChange={e => { const s = [...teachSteps]; s[i].action = e.target.value; setTeachSteps(s); }}
                    placeholder="Kya karna hai..."
                    className="flex-1 bg-slate-800 text-white text-[10px] px-2 py-1.5 rounded-lg outline-none placeholder-slate-600" />
                  {teachSteps.length > 1 && (
                    <button onClick={() => setTeachSteps(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                  )}
                </div>
              ))}
            </div>

            {/* Save */}
            <div className="flex gap-2 pt-1">
              <button onClick={handleTeachSave} disabled={!teachLabel.trim() || teachSaving}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1">
                {teachSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Save Pattern
              </button>
              <button onClick={reset} className="px-4 bg-slate-800 text-slate-400 text-xs py-2.5 rounded-xl">Skip</button>
            </div>
          </div>
        )}

        {/* ── QUERY ANSWER ── */}
        {state === 'query_answer' && queryAnswer && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-cyan-400" />
                <span className="text-[10px] text-cyan-300 uppercase tracking-widest">Response</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{queryAnswer.answer}</p>
              {queryAnswer.toolsUsed.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {queryAnswer.toolsUsed.map((t, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={reset} className="w-full bg-slate-800 text-slate-300 text-xs py-2 rounded-xl">Ask Another</button>
          </div>
        )}

        {state === 'executing' && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={20} className="animate-spin text-green-400" />
            <span className="text-sm text-slate-400">Executing...</span>
          </div>
        )}

        {state === 'done' && executionResult && (
          <div className="space-y-3">
            <div className={`text-center py-4 rounded-xl ${executionResult.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {executionResult.success ? <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" /> : <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />}
              <p className="text-sm font-bold text-white">{executionResult.success ? 'Done' : 'Failed'}</p>
              {executionResult.results?.[0]?.message && <p className="text-[10px] text-slate-400 mt-1">{executionResult.results[0].message}</p>}
              {executionResult.errors?.length > 0 && executionResult.errors.map((e: string, i: number) => (
                <p key={i} className="text-[10px] text-red-400 mt-1">{e}</p>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 bg-slate-800 text-slate-300 text-xs py-2 rounded-xl">New Event</button>
              {executionLogId && (
                <button onClick={handleReverse} disabled={reversing}
                  className="px-4 bg-red-600/20 hover:bg-red-600/30 disabled:opacity-40 text-red-400 text-xs font-bold py-2 rounded-xl flex items-center gap-1">
                  {reversing ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                  Reverse
                </button>
              )}
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400">Something went wrong</p>
            <button onClick={reset} className="mt-3 bg-slate-800 text-slate-300 text-xs px-4 py-2 rounded-xl">Try Again</button>
          </div>
        )}
      </div>

      {/* Input bar */}
      {(state === 'idle' || state === 'error' || state === 'query_answer') && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-700">
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Staff ka message likho..."
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none" />
          <button onClick={handleSend} disabled={!input.trim()}
            className="w-8 h-8 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 rounded-xl flex items-center justify-center">
            <Send size={14} className="text-white" />
          </button>
        </div>
      )}
    </div>
  );
};

export default EventOSChatWidget;
