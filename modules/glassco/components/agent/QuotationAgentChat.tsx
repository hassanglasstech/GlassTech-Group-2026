// ═══════════════════════════════════════════════════════════════════════════
// QuotationAgentChat.tsx — AI Quotation Agent Chat Interface
//
// Full-panel chat UI that sits alongside the GlasscoQuotationManager.
// User types natural-language requests → agent builds quotations live.
//
// Features:
//   • Multi-turn conversation with full history
//   • Tool call badges (get_glass_options, calculate_item, etc.)
//   • Quotation preview card: line items, amounts, discount, net total
//   • "Open in Editor" → passes quotation to GlasscoEditor for manual tweaks
//   • "Save" → calls save_quotation tool via agent (user types "save it")
//   • Saved confirmation with quotation ID
//   • "New Quotation" clears session
//   • Quick-prompt chips for common scenarios
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Sparkles, RotateCcw, X, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, AlertTriangle, ExternalLink,
  Package, Wrench, User, Calculator, Save, Zap,
} from 'lucide-react';
import { useQuotationAgent, AgentChatMessage } from '@/modules/glassco/hooks/useQuotationAgent';
import { Quotation } from '@/modules/shared/types';
import { Company } from '@/modules/shared/types/core';

// ── Tool icon map ─────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  get_glass_options:   { label: 'Glass Catalog',    icon: <Package   size={10} />, color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  get_service_catalog: { label: 'Service Rates',    icon: <Wrench    size={10} />, color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  get_client_info:     { label: 'Client Lookup',    icon: <User      size={10} />, color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  check_inventory:     { label: 'Stock Check',      icon: <Package   size={10} />, color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  calculate_item:      { label: 'Pricing Math',     icon: <Calculator size={10}/>, color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  save_quotation:      { label: 'Saved to ERP',     icon: <Save      size={10} />, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
};

// ── Quick prompt chips ────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  '5 pieces 6mm plain tempered, 48×60"',
  '10 sqft mirror 5mm with APT for bathroom',
  '8mm tinted CFG, 72×96", double glazed',
  'Zain Builders ka quotation — office lobby glass',
  '4mm plain Polish Edge, 30×36", qty 20',
];

// ── Props ─────────────────────────────────────────────────────────────────

interface QuotationAgentChatProps {
  company:       Company;
  onClose?:      () => void;
  onOpenEditor?: (q: Partial<Quotation>) => void;
}

// ── Quotation Preview Card ────────────────────────────────────────────────

const QuotationPreview: React.FC<{
  quotation:     Partial<Quotation>;
  savedId?:      string;
  onOpenEditor?: (q: Partial<Quotation>) => void;
}> = ({ quotation, savedId, onOpenEditor }) => {
  const [expanded, setExpanded] = useState(true);

  const items   = quotation.items        || [];
  const charges = quotation.serviceCharges || [];

  const itemsTotal   = items.reduce((s, i) => s + (i.amount || 0) + ((i as any).aptCharges || 0), 0);
  const chargesTotal = charges.reduce((s, c) => s + (c.amount || 0), 0);
  const gross        = itemsTotal + chargesTotal;
  const discAmt      = (quotation as any).discountAmount ||
                       (gross * ((quotation.discountPercent || 0) / 100));
  const net          = gross - discAmt;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-cyan-400" />
          <span className="text-sm font-bold text-white">
            {savedId ? `Saved: ${savedId}` : 'Generated Quotation'}
          </span>
          {savedId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ✓ In ERP
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-cyan-400">
            PKR {fmt(net)}
          </span>
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700">
          {/* Client / Project */}
          {((quotation as any).clientName || quotation.projectName) && (
            <div className="flex gap-4 pt-3">
              {(quotation as any).clientName && (
                <div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest">Client</div>
                  <div className="text-xs text-white">{(quotation as any).clientName}</div>
                </div>
              )}
              {quotation.projectName && (
                <div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest">Project</div>
                  <div className="text-xs text-white">{quotation.projectName}</div>
                </div>
              )}
            </div>
          )}

          {/* Line items */}
          {items.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Items ({items.length})</div>
              {items.slice(0, 6).map((item, idx) => (
                <div key={idx} className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-slate-300 truncate">
                      {item.description || `${item.qty}×  ${item.glassSize} ${item.glassType}`}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {item.qty} pcs · {item.totalSqFt?.toFixed(2)} sqft
                      {(item.selectedServices || []).length > 0 && (
                        <span className="ml-1 text-cyan-600">[{(item.selectedServices || []).join(', ')}]</span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-200 whitespace-nowrap">
                    PKR {fmt(item.amount || 0)}
                  </div>
                </div>
              ))}
              {items.length > 6 && (
                <div className="text-[9px] text-slate-500 italic">
                  +{items.length - 6} more items…
                </div>
              )}
            </div>
          )}

          {/* Service charges */}
          {charges.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest">Charges</div>
              {charges.map((c, i) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="text-slate-400">{(c as any).description || 'Charge'}</span>
                  <span className="text-slate-200">PKR {fmt(c.amount || 0)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-slate-700 pt-2 space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Gross</span>
              <span className="text-slate-200">PKR {fmt(gross)}</span>
            </div>
            {discAmt > 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">
                  Discount{quotation.discountPercent ? ` (${quotation.discountPercent}%)` : ''}
                </span>
                <span className="text-red-400">− PKR {fmt(discAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold">
              <span className="text-white">Net</span>
              <span className="text-cyan-400">PKR {fmt(net)}</span>
            </div>
          </div>

          {/* Actions */}
          {onOpenEditor && !savedId && (
            <button
              onClick={() => onOpenEditor(quotation)}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors"
            >
              <ExternalLink size={13} />
              Open in Editor
            </button>
          )}
          {savedId && (
            <div className="flex items-center justify-center gap-2 py-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="text-xs text-emerald-300 font-medium">Quotation saved · ID: {savedId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Message Bubble ─────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  message:       AgentChatMessage;
  onOpenEditor?: (q: Partial<Quotation>) => void;
  savedId?:      string;
}> = ({ message, onOpenEditor, savedId }) => {
  const isUser = message.role === 'user';

  // Strip the ```quotation block from display text (we show it as a card instead)
  const displayText = message.content
    .replace(/```quotation[\s\S]*?```/g, '')
    .trim();

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isUser
          ? 'bg-slate-600'
          : message.isError
            ? 'bg-red-500/20 border border-red-500/30'
            : 'bg-gradient-to-br from-cyan-500 to-blue-600'
      }`}>
        {isUser
          ? <span className="text-[10px] text-white font-bold">U</span>
          : message.isError
            ? <AlertTriangle size={12} className="text-red-400" />
            : <Sparkles size={12} className="text-white" />
        }
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Text bubble */}
        {displayText && (
          <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-cyan-600 text-white rounded-tr-sm'
              : message.isError
                ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-sm'
                : 'bg-slate-800 text-slate-200 rounded-tl-sm'
          }`}>
            {displayText}
          </div>
        )}

        {/* Tool badges */}
        {!isUser && (message.toolsUsed || []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(message.toolsUsed || [])
              .filter((t, i, arr) => arr.indexOf(t) === i) // dedupe
              .map((tool, i) => {
                const meta = TOOL_META[tool];
                return (
                  <span key={i} className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border ${meta?.color || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                    {meta?.icon}
                    {meta?.label || tool}
                  </span>
                );
              })}
          </div>
        )}

        {/* Quotation preview card */}
        {!isUser && message.quotation && (message.quotation.items || []).length > 0 && (
          <div className="w-full">
            <QuotationPreview
              quotation={message.quotation}
              savedId={savedId}
              onOpenEditor={onOpenEditor}
            />
          </div>
        )}

        {/* Timestamp */}
        <span className="text-[9px] text-slate-600 px-1">
          {new Date(message.timestamp).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

// ── Thinking indicator ────────────────────────────────────────────────────

const ThinkingBubble: React.FC<{ toolsInFlight: string[] }> = ({ toolsInFlight }) => (
  <div className="flex gap-3">
    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
      <Sparkles size={12} className="text-white" />
    </div>
    <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 size={12} className="animate-spin text-cyan-400" />
        <span className="text-xs text-slate-400">
          {toolsInFlight.length > 0
            ? `Running ${toolsInFlight[toolsInFlight.length - 1].replace(/_/g, ' ')}…`
            : 'Thinking…'
          }
        </span>
      </div>
      {toolsInFlight.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {toolsInFlight
            .filter((t, i, arr) => arr.indexOf(t) === i)
            .map((tool, i) => {
              const meta = TOOL_META[tool];
              return (
                <span key={i} className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border ${meta?.color || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                  {meta?.icon}
                  {meta?.label || tool}
                </span>
              );
            })}
        </div>
      )}
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────

const QuotationAgentChat: React.FC<QuotationAgentChatProps> = ({
  company,
  onClose,
  onOpenEditor,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    isThinking,
    currentQuotation,
    savedId,
    toolsInFlight,
    hasConversation,
    sendMessage,
    resetSession,
    openInEditor,
  } = useQuotationAgent(company, onOpenEditor);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">AI Quotation Agent</div>
            <div className="text-[10px] text-slate-400">
              {company} · Describe requirements in plain language
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasConversation && (
            <button
              onClick={resetSession}
              title="New quotation"
              className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-600 transition-colors"
            >
              <RotateCcw size={11} />
              New
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Messages area ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Welcome / empty state */}
        {!hasConversation && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            {/* Glowing icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Sparkles size={28} className="text-white" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-bold text-white">Glass Quotation Agent</p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Batao — kisi bhi glass ka quotation banao.
                Dimensions, type, services, discount — sab describe karo natural language mein.
              </p>
            </div>
            {/* Quick prompts */}
            <div className="w-full max-w-sm space-y-2">
              <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest">Quick start</p>
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickPrompt(prompt)}
                  className="w-full text-left text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 rounded-xl px-4 py-2.5 transition-colors"
                >
                  <Zap size={10} className="inline mr-2 text-cyan-500" />
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onOpenEditor={currentQuotation && onOpenEditor
              ? (q) => openInEditor(q)
              : undefined
            }
            savedId={savedId}
          />
        ))}

        {/* Thinking indicator */}
        {isThinking && <ThinkingBubble toolsInFlight={toolsInFlight} />}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Bottom: hint + current quotation summary ─────────────────── */}
      {currentQuotation && !isThinking && (
        <div className="px-5 py-2 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">
              {savedId
                ? `Saved · ${savedId}`
                : `${(currentQuotation.items || []).length} items · say "save it" to save`
              }
            </span>
            {!savedId && onOpenEditor && (
              <button
                onClick={() => openInEditor(currentQuotation)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <ExternalLink size={10} />
                Open in Editor
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Input bar ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-slate-700 bg-slate-900/80">
        {/* Suggestion hints (only when conversation is ongoing) */}
        {hasConversation && !isThinking && !savedId && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-hide">
            {['Add delivery PKR 2500', 'Make it 8mm', 'Add 10% discount', 'Save it'].map((hint, i) => (
              <button
                key={i}
                onClick={() => handleQuickPrompt(hint)}
                className="whitespace-nowrap text-[9px] text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 px-2.5 py-1 rounded-full transition-colors"
              >
                {hint}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasConversation
                ? 'Refine karo — "make tempered", "add delivery", "save it"…'
                : 'Glass quotation describe karo…'
            }
            rows={1}
            disabled={isThinking}
            className="flex-1 bg-slate-800 text-white text-sm placeholder-slate-500 rounded-xl px-4 py-2.5 resize-none outline-none border border-slate-600 focus:border-cyan-500/50 transition-colors disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="w-10 h-10 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            {isThinking
              ? <Loader2 size={16} className="text-white animate-spin" />
              : <Send size={16} className="text-white" />
            }
          </button>
        </div>
        <p className="text-[9px] text-slate-600 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line · AI can make mistakes — verify before saving
        </p>
      </div>
    </div>
  );
};

export default QuotationAgentChat;
