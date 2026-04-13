// ═══════════════════════════════════════════════════════════════════
// EventOS Chat Widget — Staff message → Workflow → Approval → Execute
// Floating button in ERP dashboard. Text + voice input.
// Shows classified event, assembled workflow, approval controls.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useRef } from 'react';
import { MessageSquare, Send, X, Mic, MicOff, CheckCircle2, XCircle, Edit3, Loader2, AlertTriangle, Zap } from 'lucide-react';
import { processStaffMessage, executeWorkflow, recordFeedback, isDataQuery, answerDataQuery, EventOSResult, QueryResult } from '../../services/eventOSService';
import { generateDevPrompt } from '../agent/DevPromptGenerator';
import { useAuthStore } from '@/modules/auth/authStore';

// ── Types ────────────────────────────────────────────────────────────
type WidgetState = 'idle' | 'classifying' | 'review' | 'executing' | 'done' | 'error' | 'query_answer';

const STEP_STATUS_COLORS: Record<string, string> = {
  ready:     'bg-green-500/10 border-green-500/30 text-green-400',
  pending:   'bg-slate-500/10 border-slate-500/30 text-slate-400',
  blocked:   'bg-red-500/10 border-red-500/30 text-red-400',
  completed: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  failed:    'bg-red-500/10 border-red-500/30 text-red-400',
};

const EventOSChatWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [state, setState] = useState<WidgetState>('idle');
  const [result, setResult] = useState<EventOSResult | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [gapMode, setGapMode] = useState(false);
  const [gapText, setGapText] = useState('');
  const [queryAnswer, setQueryAnswer] = useState<QueryResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore?.getState?.()?.user;

  // ── Send message ──────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setState('classifying');

    try {
      // Route: data query → Claude tool_use, action event → EventOS workflow
      if (isDataQuery(text)) {
        const qr = await answerDataQuery(text);
        setQueryAnswer(qr);
        setState('query_answer');
      } else {
        const res = await processStaffMessage(text, 'text');
        setResult(res);
        setState('review');
      }
    } catch (err) {
      setState('error');
    }
  };

  // ── Approve and execute ───────────────────────────────────────
  const handleApprove = async () => {
    if (!result?.workflow) return;
    setState('executing');

    try {
      const exec = await executeWorkflow(result.workflow, user?.name || 'Owner');
      setExecutionResult(exec);
      setState('done');
    } catch {
      setState('error');
    }
  };

  // ── Reject workflow ───────────────────────────────────────────
  const handleReject = async () => {
    if (result?.classification) {
      await recordFeedback(
        result.classification.pattern_id || '',
        result.workflow?.staff_message || '',
        result.classification.category,
        'rejected'
      );
    }
    reset();
  };

  // ── Report gap ────────────────────────────────────────────────
  const handleGapSubmit = async () => {
    if (!gapText.trim() || !result) return;
    await generateDevPrompt({
      event_type:        result.classification.category,
      gap_description:   gapText,
      current_behavior:  'Current workflow does not handle this correctly',
      expected_behavior: gapText,
      modules_involved:  result.workflow?.steps.map(s => s.module) || [],
      reported_by:       user?.name || 'Owner',
    });
    setGapMode(false);
    setGapText('');
  };

  const reset = () => {
    setState('idle');
    setResult(null);
    setExecutionResult(null);
    setQueryAnswer(null);
    setGapMode(false);
    setGapText('');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-transform z-50">
        <Zap size={24} className="text-white" />
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
          <span className="text-[10px] text-slate-500">Staff Message Processor</span>
        </div>
        <button onClick={() => { setOpen(false); reset(); }} className="text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Idle state */}
        {state === 'idle' && (
          <div className="text-center py-6">
            <Zap size={32} className="text-cyan-400 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Staff ka message likho ya bolo</p>
            <p className="text-[10px] text-slate-600 mt-1">EventOS classify karega aur workflow banayega</p>
          </div>
        )}

        {/* Classifying */}
        {state === 'classifying' && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={20} className="animate-spin text-cyan-400" />
            <span className="text-sm text-slate-400">Classifying event...</span>
          </div>
        )}

        {/* Review: show classification + workflow */}
        {state === 'review' && result && (
          <>
            {/* Classification */}
            <div className="bg-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{result.classification.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                  {Math.round(result.classification.confidence * 100)}% match
                </span>
              </div>
              <p className="text-[10px] text-slate-500">{result.classification.reasoning}</p>
              {result.classification.extracted.amounts.length > 0 && (
                <p className="text-[10px] text-slate-400">Amount: PKR {result.classification.extracted.amounts[0].toLocaleString()}</p>
              )}
            </div>

            {/* Preconditions */}
            {result.workflow.preconditions.length > 0 && (
              <div className="space-y-1">
                {result.workflow.preconditions.map((p, i) => (
                  <div key={i} className={`flex items-center gap-2 text-[10px] px-2 py-1 rounded ${p.passed ? 'text-green-400' : 'text-red-400'}`}>
                    {p.passed ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                    {p.detail}
                  </div>
                ))}
              </div>
            )}

            {/* Workflow steps */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Workflow Steps</div>
              {result.workflow.steps.map((step) => (
                <div key={step.step} className={`rounded-lg border px-3 py-2 ${STEP_STATUS_COLORS[step.status]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Step {step.step}: {step.module}</span>
                    {step.gl_flag && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">GL</span>}
                    {step.requires_approval && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300">Approval</span>}
                  </div>
                  <p className="text-[10px] mt-0.5 opacity-80">{step.action}</p>
                  {step.block_reason && <p className="text-[10px] text-red-400 mt-1">{step.block_reason}</p>}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button onClick={handleApprove} disabled={!result.workflow.can_execute}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1">
                <CheckCircle2 size={14} /> Approve & Execute
              </button>
              <button onClick={handleReject}
                className="px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-bold py-2.5 rounded-xl flex items-center gap-1">
                <XCircle size={14} /> Reject
              </button>
            </div>

            {/* Gap report */}
            {!gapMode ? (
              <button onClick={() => setGapMode(true)}
                className="w-full text-[10px] text-slate-500 hover:text-orange-400 py-1 flex items-center justify-center gap-1">
                <Edit3 size={10} /> Report a gap / missing step
              </button>
            ) : (
              <div className="space-y-2 bg-orange-500/5 border border-orange-500/20 rounded-xl p-3">
                <input value={gapText} onChange={e => setGapText(e.target.value)} placeholder="Kya missing hai ya galat hai..."
                  className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none" />
                <button onClick={handleGapSubmit}
                  className="w-full bg-orange-500/20 text-orange-300 text-[10px] font-bold py-1.5 rounded-lg">
                  Submit Gap Report
                </button>
              </div>
            )}
          </>
        )}

        {/* Query Answer (data response — no workflow) */}
        {state === 'query_answer' && queryAnswer && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-cyan-400" />
                <span className="text-[10px] text-cyan-300 uppercase tracking-widest">ERP Data Response</span>
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
            <button onClick={reset} className="w-full bg-slate-800 text-slate-300 text-xs py-2 rounded-xl">
              Ask Another Question
            </button>
          </div>
        )}

        {/* Executing */}
        {state === 'executing' && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={20} className="animate-spin text-green-400" />
            <span className="text-sm text-slate-400">Executing workflow...</span>
          </div>
        )}

        {/* Done */}
        {state === 'done' && executionResult && (
          <div className="space-y-3">
            <div className={`text-center py-4 rounded-xl ${executionResult.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {executionResult.success
                ? <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
                : <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />}
              <p className="text-sm font-bold text-white">
                {executionResult.success ? 'Workflow Complete' : 'Partially Failed'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {executionResult.results.length} steps executed, {executionResult.errors.length} errors
              </p>
            </div>
            {executionResult.errors.length > 0 && (
              <div className="space-y-1">
                {executionResult.errors.map((e: string, i: number) => (
                  <p key={i} className="text-[10px] text-red-400">{e}</p>
                ))}
              </div>
            )}
            <button onClick={reset} className="w-full bg-slate-800 text-slate-300 text-xs py-2 rounded-xl">
              New Event
            </button>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="text-center py-6">
            <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400">Something went wrong</p>
            <button onClick={reset} className="mt-3 bg-slate-800 text-slate-300 text-xs px-4 py-2 rounded-xl">
              Try Again
            </button>
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
