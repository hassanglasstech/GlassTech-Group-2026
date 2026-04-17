// ═══════════════════════════════════════════════════════════════════════
// Wazir Types — The Digital Shadow Self
// ═══════════════════════════════════════════════════════════════════════

export type WazirDecisionType =
  | 'quotation_approve'
  | 'credit_extend'
  | 'vendor_payment'
  | 'hire'
  | 'purchase'
  | 'pricing'
  | 'discount'
  | 'loan_approve'
  | 'other';

export type OutcomeStatus =
  | 'pending'
  | 'success'
  | 'partial'
  | 'failed'
  | 'mixed';

export interface WazirDecision {
  id:                 string;
  company?:           string;
  decisionType:       WazirDecisionType;
  subject:            string;
  context:            Record<string, any>;
  decisionText?:      string;
  decidedBy?:         string;
  decidedAt:          string;
  amount?:            number;
  relatedDocs:        Array<{ type: string; id: string }>;

  outcomeStatus?:     OutcomeStatus;
  outcomeEvaluatedAt?: string;
  outcomeNotes?:      string;
  outcomeNumeric?:    number;
  lessonsExtracted:   boolean;

  tags:               string[];
  createdAt:          string;
  updatedAt:          string;
}

export interface WazirLesson {
  id:              string;
  category:        'pricing' | 'credit' | 'hiring' | 'vendor' | 'operations' | 'general';
  pattern:         string;
  evidenceCount:   number;
  confidence:      number; // 0-1
  sourceDecisions: string[];
  firstObserved:   string;
  lastReinforced:  string;
  isActive:        boolean;
  tags:            string[];
  createdAt:       string;
}

export interface WazirVoiceSample {
  id:             string;
  channel:        'whatsapp' | 'email' | 'internal_chat';
  recipientType:  'client' | 'vendor' | 'employee' | 'partner';
  context?:       string;
  message:        string;
  toneTags:       string[];
  language:       'ur' | 'en' | 'ur-en';
  capturedAt:     string;
  isApproved:     boolean;
}

export interface WazirWeeklyReport {
  id:                string;
  reportDate:        string; // YYYY-MM-DD
  weekNumber:        number;
  year:              number;
  companiesCovered:  string[];

  headline:          string;
  body:              string;
  topConcerns:       Array<{ concern: string; severity: 'low'|'medium'|'high'; data?: any }>;
  topOpportunities:  Array<{ opportunity: string; potential: string; data?: any }>;
  bigQuestion:       string;

  metricsSnapshot:   Record<string, any>;

  whatsappSentAt?:   string;
  ownerReplied:      boolean;
  ownerReply?:       string;

  inputTokens?:      number;
  outputTokens?:     number;
  costPkr?:          number;

  createdAt:         string;
}

export interface WazirConversationMessage {
  id:                  string;
  threadId?:           string;
  role:                'user' | 'assistant' | 'system';
  content:             string;
  toolCalls?:          any[];
  toolResults?:        any[];
  moodTag?:            'normal' | 'stressed' | 'celebratory' | 'strategic' | 'late-night';
  relatedDecisionId?:  string;
  channel:             'app' | 'whatsapp' | 'telegram';
  timestamp:           string;
  tokensUsed?:         number;
  modelUsed?:          string;
}

export type PresenceMode = 'active' | 'leave' | 'sick' | 'travel' | 'do-not-disturb';

export interface OwnerPresenceState {
  id:                    string;
  isPresent:             boolean;
  mode:                  PresenceMode;
  modeSince?:            string;
  modeUntil?:            string;
  autoReplyEnabled:      boolean;
  escalationThreshold:   'low' | 'medium' | 'high';
  handledCount:          number;
  escalatedCount:        number;
  pendingReview:         Array<{
    from:            string;
    message:         string;
    suggestedReply:  string;
    urgency:         'low' | 'medium' | 'high';
    at:              string;
  }>;
  lastSyncAt:            string;
  updatedAt:             string;
}

// Wazir's "challenge" response when the owner is about to make a big decision
export interface WazirChallenge {
  decisionSubject: string;
  shouldBlock:     boolean; // false = advisory only, true = require 'override' confirm
  questions:       string[];
  riskLevel:       'low' | 'medium' | 'high' | 'critical';
  historicalContext?: string;
  recommendation?: string;
}
