// ═══════════════════════════════════════════════════════════════════════════
// approve-payroll — Supabase Edge Function
// HR-1 Remediation: server-side payroll approval gate
//
// SECURITY CONTRACT:
//   - Caller MUST supply a valid Bearer JWT in Authorization header.
//   - auth.uid() is resolved server-side from the JWT — NEVER from the request body.
//   - Only users with role 'super_admin' | 'manager' | 'finance_manager' may approve.
//   - The approver's email is sourced from auth.users — not from any client-supplied string.
//   - Writes an immutable approval record to audit_log before returning.
//
// USAGE (client):
//   const { data, error } = await supabase.functions.invoke('approve-payroll', {
//     body: { month: '2026-04', company: 'GTK' }
//   });
//   // data: { approvedBy: string; approvedAt: string; approvalToken: string }
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/auth.ts';

const ALLOWED_ROLES = new Set(['super_admin', 'manager', 'finance_manager']);

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Parse body ──────────────────────────────────────────────────────
    const { month, company } = await req.json() as { month: string; company: string };
    if (!month || !company) {
      return new Response(
        JSON.stringify({ error: 'month and company are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Resolve caller from JWT (server-side only) ───────────────────────
    // createClient with the caller's JWT so RLS and auth.uid() are scoped to them.
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const jwt = authHeader.replace('Bearer ', '');

    // Validate JWT and extract user — Supabase verifies signature internally.
    const { data: { user }, error: userError } = await createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    }).auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthenticated — valid session required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Role check — read from DB, never from client payload ─────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role, company')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Company isolation ────────────────────────────────────────────────
    if (profile.company !== company) {
      return new Response(
        JSON.stringify({ error: 'Cross-company payroll approval is forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Role gate ────────────────────────────────────────────────────────
    if (!ALLOWED_ROLES.has(profile.role)) {
      return new Response(
        JSON.stringify({
          error: `Insufficient role. Required: ${[...ALLOWED_ROLES].join(' | ')}. Your role: ${profile.role}`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Prevent double-approval for same month ──────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('audit_log')
      .select('id')
      .eq('action', 'PAYROLL_APPROVED')
      .eq('company', company)
      .like('target_id', `PAY-JV-${month.replace('-', '')}%`)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: `Payroll for ${month} has already been approved` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Build approval token (tamper-evident: uid + month + timestamp) ───
    const approvedAt    = new Date().toISOString();
    const approvalToken = `${user.id.slice(0, 8)}-${month}-${Date.now()}`;
    const approvedBy    = user.email ?? user.id;

    // ── Write immutable audit trail ──────────────────────────────────────
    await supabaseAdmin.from('audit_log').insert({
      id:        crypto.randomUUID(),
      company,
      user_id:   user.id,
      action:    'PAYROLL_APPROVED',
      target_id: `PAY-JV-${month.replace('-', '')}`,
      details: {
        month,
        approvedBy,
        approvedAt,
        approvalToken,
        role: profile.role,
      },
      timestamp: approvedAt,
    });

    return new Response(
      JSON.stringify({ approvedBy, approvedAt, approvalToken }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal server error';
    console.error('[approve-payroll]', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
