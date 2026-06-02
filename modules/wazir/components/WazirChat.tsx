// ═══════════════════════════════════════════════════════════════════════
// WazirChat — The interface to your Digital Shadow Self
//
// Premium dark-theme conversational UI. Full-screen. Persistent thread.
// Shows recent lessons and decisions in a side panel as "context awareness"
// — so the owner sees that Wazir actually knows them.
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import {
  chatWithWazir,
  getConversationHistory,
  getLatestWeeklyReport,
} from '../services/wazirService';
import { supabase } from '@/src/services/supabaseClient';
import type {
  WazirConversationMessage,
  WazirLesson,
  WazirDecision,
  WazirWeeklyReport,
} from '../types/wazir';

interface WazirChatProps {
  onClose?: () => void;
}

const WazirChat: React.FC<WazirChatProps> = ({ onClose }) => {
  const [threadId] = useState(() => `thread-${new Date().toISOString().split('T')[0]}`);
  const [messages, setMessages] = useState<WazirConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [toolsInFlight, setToolsInFlight] = useState<string[]>([]);

  // Context panel data
  const [lessons,  setLessons]  = useState<WazirLesson[]>([]);
  const [decisions, setDecisions] = useState<WazirDecision[]>([]);
  const [latestReport, setLatestReport] = useState<WazirWeeklyReport | null>(null);
  const [showContext, setShowContext] = useState(true);

  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load conversation history + context on mount ──────────────────
  useEffect(() => {
    (async () => {
      const [history, lessonsRes, decisionsRes, report] = await Promise.all([
        getConversationHistory(threadId, 100),
        supabase.from('wazir_lessons').select('*').eq('is_active', true).order('confidence', { ascending: false }).limit(6),
        supabase.from('wazir_decisions').select('*').order('decided_at', { ascending: false }).limit(5),
        getLatestWeeklyReport(),
      ]);
      setMessages(history);
      setLessons((lessonsRes.data || []).map((r: any) => ({
        id: r.id, category: r.category, pattern: r.pattern,
        evidenceCount: r.evidence_count, confidence: r.confidence,
        sourceDecisions: r.source_decisions || [],
        firstObserved: r.first_observed, lastReinforced: r.last_reinforced,
        isActive: r.is_active, tags: r.tags || [], createdAt: r.created_at,
      })));
      setDecisions((decisionsRes.data || []).map((r: any) => ({
        id: r.id, company: r.company, decisionType: r.decision_type,
        subject: r.subject, context: r.context || {}, decisionText: r.decision_text,
        decidedBy: r.decided_by, decidedAt: r.decided_at, amount: r.amount,
        relatedDocs: r.related_docs || [], outcomeStatus: r.outcome_status,
        outcomeEvaluatedAt: r.outcome_evaluated_at, outcomeNotes: r.outcome_notes,
        outcomeNumeric: r.outcome_numeric, lessonsExtracted: r.lessons_extracted,
        tags: r.tags || [], createdAt: r.created_at, updatedAt: r.updated_at,
      })));
      setLatestReport(report);
    })();
  }, [threadId]);

  // ── Auto-scroll to bottom on new message ──────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ── Auto-focus input ──────────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Send message ──────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');

    // Optimistically show user message
    const userMsg: WazirConversationMessage = {
      id: `temp-${Date.now()}`,
      threadId,
      role: 'user',
      content: text,
      channel: 'app',
      timestamp: new Date().toISOString(),
    };
    setMessages(m => [...m, userMsg]);
    setIsThinking(true);
    setToolsInFlight([]);

    try {
      const result = await chatWithWazir(text, { threadId, channel: 'app' });
      setToolsInFlight(result.toolsUsed);

      const assistantMsg: WazirConversationMessage = {
        id: `temp-${Date.now() + 1}`,
        threadId,
        role: 'assistant',
        content: result.reply,
        channel: 'app',
        timestamp: new Date().toISOString(),
        tokensUsed: result.tokensUsed,
        modelUsed: 'claude-sonnet-4-6',
        relatedDecisionId: result.decisionLogged,
      };
      setMessages(m => [...m, assistantMsg]);

      // If a decision was logged, refresh the decisions panel
      if (result.decisionLogged) {
        const { data } = await supabase.from('wazir_decisions').select('*').order('decided_at', { ascending: false }).limit(5);
        setDecisions((data || []).map((r: any) => ({
          id: r.id, company: r.company, decisionType: r.decision_type,
          subject: r.subject, context: r.context || {}, decisionText: r.decision_text,
          decidedBy: r.decided_by, decidedAt: r.decided_at, amount: r.amount,
          relatedDocs: r.related_docs || [], outcomeStatus: r.outcome_status,
          outcomeEvaluatedAt: r.outcome_evaluated_at, outcomeNotes: r.outcome_notes,
          outcomeNumeric: r.outcome_numeric, lessonsExtracted: r.lessons_extracted,
          tags: r.tags || [], createdAt: r.created_at, updatedAt: r.updated_at,
        })));
      }
    } catch (err: any) {
      const errMsg: WazirConversationMessage = {
        id: `err-${Date.now()}`,
        threadId,
        role: 'assistant',
        content: `Boss, mujhe ek masla aa gaya: ${err?.message || 'unknown error'}. Thori der baad phir try karein.`,
        channel: 'app',
        timestamp: new Date().toISOString(),
      };
      setMessages(m => [...m, errMsg]);
    } finally {
      setIsThinking(false);
      setTimeout(() => setToolsInFlight([]), 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100">

      {/* ══ Main Chat Area ══ */}
      <div className="flex-1 flex flex-col">

        {/* Header */}
        <div className="border-b border-slate-700/50 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-xl font-bold shadow-lg shadow-amber-500/20">
              و
            </div>
            <div>
              <div className="text-lg font-semibold flex items-center gap-2">
                Wazir
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  online
                </span>
              </div>
              <div className="text-xs text-slate-400">Tumhara digital shadow — sab yaad hai</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowContext(s => !s)}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              {showContext ? 'Hide context' : 'Show context'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white text-xl leading-none px-2"
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-8">

          {isEmpty ? (
            /* Welcome screen */
            <div className="max-w-2xl mx-auto mt-12">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600 shadow-xl shadow-rose-500/30 mb-5">
                  <span className="text-4xl font-bold text-white">و</span>
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-300 via-rose-300 to-purple-300 bg-clip-text text-transparent">
                  Assalam-o-alaikum, Hassan bhai
                </h1>
                <p className="mt-3 text-slate-400 max-w-md mx-auto">
                  Main Wazir hoon — tumhari business ki memory, tumhara sounding board,
                  24/7 available. Kuch bhi pucho.
                </p>
              </div>

              {/* Quick-start prompts */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '📊 Aaj ka AR status?',           prompt: 'Aaj AR aging ka status batao. Sab se purani receivables kya hain?' },
                  { label: '💰 Cash position?',               prompt: 'Meri cash position kya hai? AR vs AP vs upcoming payroll.' },
                  { label: '📦 Stock urgency?',                prompt: 'Kaun se materials reorder point ke qareeb hain? Stockout risk kya hai?' },
                  { label: '🎯 Is week ka board brief?',       prompt: 'Mujhe is week ka board-level brief do — top 3 things I should know.' },
                  { label: '🤔 Ek decision mein help karo',    prompt: 'Mujhe ek decision mein help chahiye. Pehle mujh se mauqa ka context poocho.' },
                  { label: '📈 Koi pattern dikha?',            prompt: 'Last 30 days mein kuch unusual ya worth-attention pattern hai?' },
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(q.prompt); inputRef.current?.focus(); }}
                    className="text-left p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-amber-500/30 transition"
                  >
                    <div className="text-sm font-medium text-slate-200">{q.label}</div>
                  </button>
                ))}
              </div>

              {latestReport && (
                <div className="mt-10 p-5 rounded-xl bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/20">
                  <div className="text-xs uppercase tracking-wider text-purple-400 mb-2">
                    Last Sunday's Board Brief — {latestReport.reportDate}
                  </div>
                  <div className="text-base font-medium text-slate-100 mb-2">{latestReport.headline}</div>
                  {latestReport.bigQuestion && (
                    <div className="text-sm text-slate-400 italic mt-3">
                      💭 {latestReport.bigQuestion}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map(m => (
                <MessageBubble key={m.id} msg={m} />
              ))}

              {isThinking && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-sm font-bold shrink-0">
                    و
                  </div>
                  <div className="flex-1">
                    <div className="px-4 py-3 rounded-2xl bg-slate-800/50 border border-slate-700/40 inline-flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                        <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-sm text-slate-400">
                        {toolsInFlight.length > 0
                          ? `checking ${toolsInFlight[toolsInFlight.length - 1].replace('_', ' ')}…`
                          : 'soch raha hoon…'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-slate-700/50 bg-slate-900/60 backdrop-blur px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Wazir se baat karo… (Enter to send, Shift+Enter for new line)"
              className="flex-1 resize-none bg-slate-800/50 border border-slate-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none transition"
              style={{ maxHeight: '120px' }}
              disabled={isThinking}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="px-5 py-3 rounded-xl bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600 text-white font-semibold shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <div className="max-w-3xl mx-auto mt-2 text-[10px] text-slate-600 text-center">
            Wazir has access to all 5 companies' live data. Everything you share stays in your database.
          </div>
        </div>
      </div>

      {/* ══ Context Panel ══ */}
      {showContext && (
        <div className="w-80 border-l border-slate-700/50 bg-slate-900/40 overflow-y-auto px-5 py-6">

          {/* Lessons learned */}
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-amber-400 mb-3 font-semibold">
              🧠 What Wazir has learned
            </div>
            {lessons.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                Wazir is still learning you. Make some decisions and Wazir will start finding patterns.
              </div>
            ) : (
              <div className="space-y-2">
                {lessons.map(l => (
                  <div key={l.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wide text-amber-400">{l.category}</span>
                      <span className="text-[10px] text-slate-500">{(l.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-xs text-slate-300 leading-relaxed">{l.pattern}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent decisions */}
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-rose-400 mb-3 font-semibold">
              📋 Recent decisions
            </div>
            {decisions.length === 0 ? (
              <div className="text-xs text-slate-500 italic">
                No decisions logged yet. Wazir will automatically capture important ones from your conversations.
              </div>
            ) : (
              <div className="space-y-2">
                {decisions.map(d => (
                  <div key={d.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wide text-rose-400">{d.decisionType}</span>
                      <OutcomeBadge status={d.outcomeStatus} />
                    </div>
                    <div className="text-xs text-slate-300 font-medium">{d.subject}</div>
                    {d.amount && (
                      <div className="text-[10px] text-slate-500 mt-1">PKR {d.amount.toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Latest weekly report shortcut */}
          {latestReport && (
            <div>
              <div className="text-xs uppercase tracking-wider text-purple-400 mb-3 font-semibold">
                📊 Last board brief
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/20">
                <div className="text-[10px] text-purple-400 mb-1">{latestReport.reportDate}</div>
                <div className="text-xs text-slate-300 leading-relaxed">{latestReport.headline}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ══ Sub-components ══

const MessageBubble: React.FC<{ msg: WazirConversationMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
        isUser
          ? 'bg-slate-700 text-slate-200'
          : 'bg-gradient-to-br from-amber-500 via-rose-500 to-purple-600 text-white'
      }`}>
        {isUser ? 'H' : 'و'}
      </div>
      <div className={`flex-1 ${isUser ? 'flex justify-end' : ''}`}>
        <div className={`px-4 py-3 rounded-2xl max-w-[85%] whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-slate-700/60 text-slate-100 rounded-br-sm'
            : 'bg-slate-800/50 border border-slate-700/40 text-slate-100 rounded-bl-sm'
        }`}>
          <div className="text-sm leading-relaxed">{msg.content}</div>
          {msg.relatedDecisionId && (
            <div className="mt-2 pt-2 border-t border-slate-700/40 text-[10px] text-amber-400">
              📌 Decision logged: {msg.relatedDecisionId}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const OutcomeBadge: React.FC<{ status?: string }> = ({ status }) => {
  const config: Record<string, { label: string; cls: string }> = {
    pending:  { label: '⋯',   cls: 'bg-slate-700/50 text-slate-400' },
    success:  { label: '✓',   cls: 'bg-emerald-500/15 text-emerald-400' },
    partial:  { label: '~',   cls: 'bg-amber-500/15  text-amber-400'  },
    failed:   { label: '✗',   cls: 'bg-rose-500/15   text-rose-400'   },
    mixed:    { label: '?',   cls: 'bg-purple-500/15 text-purple-400' },
  };
  const c = config[status || 'pending'] || config.pending;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>
  );
};

export default WazirChat;
