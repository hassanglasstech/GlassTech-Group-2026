import { supabase } from '@/src/services/supabaseClient';
import { sanitizeUserInput } from '@/modules/factory/services/promptSanitizer';

interface AdversarialResult {
  initialAnswer:  string;
  challenges:     string[];
  revisedAnswer:  string;
  wasRevised:     boolean;
  revisionReason: string;
}

// ── Run adversarial analysis on a query+answer ────────────────────────
export const runAdversarial = async (
  query:         string,
  initialAnswer: string,
  erpContext:    string
): Promise<AdversarialResult> => {

  // Sanitize inputs before sending to Claude
  query = sanitizeUserInput(query);

  // Step 1: Generate challenges against the initial answer
  const { data: { session: _s1 } } = await supabase.auth.getSession();
  const _proxy = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
  const challengeRes = await fetch(_proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_s1?.access_token}` },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:     `You are a devil's advocate for a Pakistani glass manufacturing business.
Your job: find flaws, risks, and blind spots in business recommendations.
Be specific. Use numbers when possible. Be brief — 3-4 challenges max.
Format: bullet points only. No preamble.`,
      messages: [{
        role:    'user',
        content: `Query: "${query}"\nRecommendation: "${initialAnswer}"\n\nWhat are the strongest arguments AGAINST this recommendation?`,
      }],
    }),
  });

  const challengeData = await challengeRes.json();
  const challengeText = challengeData.content?.[0]?.text || '';
  const challenges    = challengeText.split('\n').filter((l: string) => l.trim().startsWith('-') || l.trim().startsWith('•')).map((l: string) => l.replace(/^[-•]\s*/, '').trim());

  if (challenges.length === 0) {
    return { initialAnswer, challenges: [], revisedAnswer: initialAnswer, wasRevised: false, revisionReason: '' };
  }

  // Step 2: Revise the answer considering challenges
  const reviseRes = await fetch(_proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_s1?.access_token}` },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      system:     `You are GlassTech ERP advisor. You have given an initial recommendation and now you see counter-arguments.
Provide a REVISED, more nuanced recommendation that addresses the challenges.
If original was correct despite challenges — defend it clearly.
Be direct. Urdu/English mix ok. Max 4 sentences.`,
      messages: [{
        role:    'user',
        content: `Original query: "${query}"\nMy initial answer: "${initialAnswer}"\nChallenges raised:\n${challenges.map((c: string) => `- ${c}`).join('\n')}\n\nRevised recommendation:`,
      }],
    }),
  });

  const reviseData   = await reviseRes.json();
  const revisedAnswer = reviseData.content?.[0]?.text || initialAnswer;
  const wasRevised    = revisedAnswer.length > 20 && revisedAnswer !== initialAnswer;

  // Log to Supabase
  await supabase.from('adversarial_log').insert({
    query,
    initial_answer:  initialAnswer,
    challenges:      JSON.stringify(challenges),
    revised_answer:  revisedAnswer,
    was_revised:     wasRevised,
    revision_reason: wasRevised ? challenges[0] : '',
    created_at:      new Date().toISOString(),
  }).then(undefined, () => {});

  return { initialAnswer, challenges, revisedAnswer, wasRevised, revisionReason: wasRevised ? challenges[0] : '' };
};

// ── Detect if query needs adversarial mode ────────────────────────────
export const needsAdversarial = (query: string): boolean => {
  const q = query.toLowerCase();
  return [
    'accept', 'approve', 'karo', 'lelo', 'banao', 'recommend',
    'sahi hai', 'theek hai', 'kya lagta', 'decide', 'should',
  ].some(kw => q.includes(kw));
};

// ── Generate uncomfortable truths ─────────────────────────────────────
export const generateUncomfortableTruths = async (erpContext: string): Promise<string[]> => {
  const { data: { session: _s2 } } = await supabase.auth.getSession();
  const _proxy2 = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-proxy`;
  const res = await fetch(_proxy2, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_s2?.access_token}` },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      system:     `You are a brutally honest business advisor for a Pakistani glass manufacturing company.
Find uncomfortable truths the owner might not want to hear but NEEDS to hear.
Base findings on the ERP data provided.
Format: JSON array of objects: [{category, title, finding, severity}]
Severity: low | medium | high | critical
Max 3 truths. Be specific with numbers. No preamble, no markdown, pure JSON only.`,
      messages: [{
        role:    'user',
        content: `ERP Data:\n${erpContext}\n\nFind uncomfortable business truths:`,
      }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    const truths = JSON.parse(text.replace(/```json|```/g, '').trim());
    // Save to DB
    for (const t of truths) {
      await supabase.from('uncomfortable_truths').upsert({
        category:      t.category || 'general',
        title:         t.title,
        finding:       t.finding,
        data_evidence: {},
        severity:      t.severity || 'medium',
        acknowledged:  false,
        created_at:    new Date().toISOString(),
      }, { onConflict: 'title' }).then(undefined, () => {});
    }
    return truths.map((t: any) => `**${t.title}**: ${t.finding}`);
  } catch {
    return [];
  }
};
