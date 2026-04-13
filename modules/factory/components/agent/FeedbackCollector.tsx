// ═══════════════════════════════════════════════════════════════════
// Feedback Collector — Owner confirms / amends / overrides agent decisions
// Shows decision reasoning, confidence, similar past decisions.
// Feeds back into episodic memory for learning loop.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Edit3, XCircle, ChevronDown, ChevronUp, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from '@/src/services/supabaseClient';
import { recordFeedback, getSimilarDecisions, EpisodicMemory } from '@/modules/factory/services/decisionMemoryService';

interface FeedbackCollectorProps {
  decisionId:   string;
  agentType:    string;
  decisionType: string;
  decision:     string;
  reasoning:    string;
  conditions:   string[];
  confidence:   number;
  context:      Record<string, any>;
  onFeedback:   (feedback: 'confirmed' | 'overridden' | 'amended', reason?: string) => void;
}

const CONFIDENCE_COLOR = (c: number) =>
  c >= 0.85 ? 'text-green-400' : c >= 0.60 ? 'text-yellow-400' : 'text-red-400';

const CONFIDENCE_LABEL = (c: number) =>
  c >= 0.85 ? 'High' : c >= 0.60 ? 'Medium' : 'Low';

const FeedbackCollector: React.FC<FeedbackCollectorProps> = ({
  decisionId, agentType, decisionType, decision, reasoning, conditions, confidence, context, onFeedback,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]         = useState<EpisodicMemory[]>([]);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [amendMode, setAmendMode]     = useState(false);
  const [submitted, setSubmitted]     = useState(false);

  useEffect(() => {
    getSimilarDecisions(agentType, decisionType, 5).then(setHistory);
  }, [agentType, decisionType]);

  const handleConfirm = async () => {
    await recordFeedback(decisionId, 'confirmed');
    setSubmitted(true);
    onFeedback('confirmed');
  };

  const handleOverride = async () => {
    if (!overrideReason.trim()) return;
    await recordFeedback(decisionId, 'overridden', overrideReason);
    setSubmitted(true);
    onFeedback('overridden', overrideReason);
  };

  const handleAmend = async () => {
    await recordFeedback(decisionId, 'amended');
    setSubmitted(true);
    onFeedback('amended');
  };

  if (submitted) {
    return (
      <div className="bg-slate-800 rounded-xl p-4 text-center">
        <CheckCircle2 size={24} className="text-green-400 mx-auto mb-2" />
        <p className="text-sm text-slate-300">Feedback recorded. Decision memory updated.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      {/* Decision Header */}
      <div className="px-4 py-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wide">{agentType} Agent</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">{decisionType}</span>
          </div>
          <div className={`text-sm font-bold ${CONFIDENCE_COLOR(confidence)}`}>
            {Math.round(confidence * 100)}% {CONFIDENCE_LABEL(confidence)}
          </div>
        </div>
      </div>

      {/* Decision Details */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            decision.includes('APPROVE') ? 'bg-green-500/20 text-green-400' :
            decision === 'REJECT' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>{decision}</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{reasoning}</p>

        {conditions.length > 0 && (
          <div className="space-y-1 mt-2">
            <span className="text-[10px] text-slate-500 uppercase">Conditions</span>
            {conditions.map((c, i) => (
              <p key={i} className="text-[10px] text-orange-300 pl-2 border-l border-orange-500/30">{c}</p>
            ))}
          </div>
        )}
      </div>

      {/* Similar Past Decisions */}
      {history.length > 0 && (
        <div className="px-4 pb-2">
          <button onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300">
            {showHistory ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {history.length} similar past decisions
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.map((h, i) => (
                <div key={i} className="bg-slate-900 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400">{h.decision_made}</span>
                    <span className="text-[10px] text-slate-600 ml-2">
                      {h.confidence_score ? `${Math.round(h.confidence_score * 100)}%` : ''}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold ${
                    h.outcome === 'success' || h.outcome === 'paid' ? 'text-green-400' :
                    h.outcome === 'failure' || h.outcome === 'defaulted' ? 'text-red-400' :
                    'text-slate-500'
                  }`}>
                    {h.outcome || 'pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Override input */}
      {overrideMode && (
        <div className="px-4 pb-2">
          <input value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
            placeholder="Override reason (required)..."
            className="w-full bg-slate-900 text-white text-xs px-3 py-2 rounded-lg outline-none placeholder-slate-600" />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 px-4 py-3 border-t border-slate-700">
        {!overrideMode && !amendMode ? (
          <>
            <button onClick={handleConfirm}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} /> Confirm
            </button>
            <button onClick={() => setAmendMode(true)}
              className="px-4 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-xs font-bold py-2.5 rounded-xl flex items-center gap-1.5">
              <Edit3 size={14} /> Amend
            </button>
            <button onClick={() => setOverrideMode(true)}
              className="px-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-bold py-2.5 rounded-xl flex items-center gap-1.5">
              <XCircle size={14} /> Override
            </button>
          </>
        ) : overrideMode ? (
          <>
            <button onClick={handleOverride} disabled={!overrideReason.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold py-2.5 rounded-xl">
              Confirm Override
            </button>
            <button onClick={() => setOverrideMode(false)}
              className="px-4 bg-slate-700 text-slate-300 text-xs py-2.5 rounded-xl">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={handleAmend}
              className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-2.5 rounded-xl">
              Save Amendments
            </button>
            <button onClick={() => setAmendMode(false)}
              className="px-4 bg-slate-700 text-slate-300 text-xs py-2.5 rounded-xl">Cancel</button>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackCollector;
