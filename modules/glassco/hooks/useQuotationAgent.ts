// ═══════════════════════════════════════════════════════════════════════════
// useQuotationAgent.ts — React hook for AI Quotation Agent
//
// Wraps QuotationAgent.ts (chatQuotation / createSession) into clean React
// state so QuotationAgentChat.tsx only deals with UI logic.
//
// State managed:
//   messages       → full conversation display history
//   isThinking     → true while Claude is running (shows spinner)
//   currentQuotation → latest Quotation object produced by agent
//   savedId        → set when agent calls save_quotation tool
//   session        → QuotationAgentSession (carries Claude message history)
//   toolsInFlight  → which tools fired on the last round (for UI badges)
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react';
import {
  chatQuotation,
  createSession,
  QuotationAgentSession,
  QuotationAgentMessage,
} from '@/modules/glassco/components/agent/QuotationAgent';
import { Quotation } from '@/modules/shared/types';
import { Company } from '@/modules/shared/types/core';
import { errMsg as toErrorString } from '@/modules/shared/services/utils';

// ── Types ────────────────────────────────────────────────────────────────

export interface AgentChatMessage {
  id:         string;
  role:       'user' | 'assistant' | 'system';
  content:    string;
  toolsUsed?: string[];
  quotation?: Partial<Quotation>;
  timestamp:  string;
  isError?:   boolean;
}

export interface UseQuotationAgentReturn {
  // State
  messages:          AgentChatMessage[];
  isThinking:        boolean;
  currentQuotation:  Partial<Quotation> | null;
  savedId:           string | undefined;
  toolsInFlight:     string[];
  hasConversation:   boolean;

  // Actions
  sendMessage:  (text: string) => Promise<void>;
  resetSession: () => void;
  openInEditor: (q: Partial<Quotation>) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useQuotationAgent(
  company:      Company,
  onOpenEditor?: (q: Partial<Quotation>) => void,
): UseQuotationAgentReturn {
  const [messages,         setMessages]         = useState<AgentChatMessage[]>([]);
  const [isThinking,       setIsThinking]       = useState(false);
  const [currentQuotation, setCurrentQuotation] = useState<Partial<Quotation> | null>(null);
  const [savedId,          setSavedId]          = useState<string | undefined>(undefined);
  const [toolsInFlight,    setToolsInFlight]    = useState<string[]>([]);

  // Session reference — persists across renders without triggering re-render
  const sessionRef = useRef<QuotationAgentSession>(createSession(company));

  // ── sendMessage ─────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;

    const userMsg: AgentChatMessage = {
      id:        `msg-user-${Date.now()}`,
      role:      'user',
      content:   text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setToolsInFlight([]);

    try {
      const result = await chatQuotation(text.trim(), sessionRef.current);

      // Update session with full history (multi-turn memory)
      sessionRef.current = result.updatedSession;

      // Update tool indicators
      setToolsInFlight(result.toolsUsed);

      // Update current quotation if agent produced one
      if (result.quotation) {
        setCurrentQuotation(result.quotation);
      }

      // Update saved ID if agent saved
      if (result.savedId) {
        setSavedId(result.savedId);
      }

      // Add assistant message
      const assistantMsg: AgentChatMessage = {
        id:        `msg-asst-${Date.now()}`,
        role:      'assistant',
        content:   result.explanation,
        toolsUsed: result.toolsUsed,
        quotation: result.quotation || undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (err: unknown) {
      const errMsg: AgentChatMessage = {
        id:        `msg-err-${Date.now()}`,
        role:      'assistant',
        content:   `Agent error: ${toErrorString(err, 'Something went wrong. Please try again.')}`,
        timestamp: new Date().toISOString(),
        isError:   true,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsThinking(false);
    }
  }, [isThinking, company]);

  // ── resetSession ────────────────────────────────────────────────────
  const resetSession = useCallback(() => {
    sessionRef.current   = createSession(company);
    setMessages([]);
    setIsThinking(false);
    setCurrentQuotation(null);
    setSavedId(undefined);
    setToolsInFlight([]);
  }, [company]);

  // ── openInEditor ────────────────────────────────────────────────────
  const openInEditor = useCallback((q: Partial<Quotation>) => {
    onOpenEditor?.(q);
  }, [onOpenEditor]);

  return {
    messages,
    isThinking,
    currentQuotation,
    savedId,
    toolsInFlight,
    hasConversation: messages.length > 0,
    sendMessage,
    resetSession,
    openInEditor,
  };
}
