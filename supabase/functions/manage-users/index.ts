// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: manage-users
// 
// Deploy: supabase functions deploy manage-users
// This keeps the service_role key server-side (never exposed to browser)
//
// The UserAccessManager calls this function instead of
// supabase.auth.admin.* directly.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Inlined corsHeaders (was: import from ../_shared/auth.ts).
// Inlined so dashboard-paste deploys work — dashboard only uploads index.ts
// and can't follow the _shared/ relative import.
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create admin client with service_role key (server-side only)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Create user client to verify caller
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller is authenticated
    const { data: { user: caller } } = await supabaseUser.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // CRITICAL: previously this query selected ('role, company') with .single()
    // and only destructured `data`, swallowing any DB error. If the `company`
    // column doesn't exist on user_profiles in some envs (it's optional in our
    // schema), the query errors out, `data` is null, and the role check below
    // sees "(no profile)" → 403 even for a real super_admin.
    //
    // Fix: select only what we need (`role`), use .maybeSingle(), and surface
    // any DB error to the caller instead of silently treating it as "no profile".
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()

    if (profileErr) {
      return new Response(
        JSON.stringify({ error: `Profile lookup failed: ${profileErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Allow any of the three "Hassan-tier" full-access roles. The UI in
    // UserAccessManager already guards on the same set, but the edge function
    // is the security boundary so we re-check here.
    const ADMIN_ROLES = ['super_admin', 'owner', 'hassan']
    if (!callerProfile?.role || !ADMIN_ROLES.includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({
          error: `Admin access required. Caller id: ${caller.id}. Your role: ${callerProfile?.role || '(no profile row)'} — needs one of: ${ADMIN_ROLES.join(', ')}`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Parse request
    const { action, ...params } = await req.json()

    // ── M-1: Audit log helper — writes to audit_log table via service role ──
    // Called AFTER every successful action. Failures are logged to console only
    // (audit write failures must never block the primary user-management operation).
    const writeAuditLog = async (targetId: string | null, details: Record<string, unknown>) => {
      try {
        await supabaseAdmin.from('audit_log').insert({
          id:        crypto.randomUUID(),
          company:   'system',  // schema-agnostic — caller's company isn't required for audit
          user_id:   caller.id,
          action,
          target_id: targetId,
          details,
          timestamp: new Date().toISOString(),
        })
      } catch (auditErr) {
        console.error('[manage-users] audit_log write failed:', auditErr)
      }
    }

    let result: any

    switch (action) {
      case 'create_user': {
        const { email, password, user_metadata } = params
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: password || undefined,
          email_confirm: true,
          user_metadata,
        })
        if (error) throw error
        result = { user: { id: data.user.id, email: data.user.email } }
        await writeAuditLog(data.user.id, { email: data.user.email, metadata_keys: Object.keys(user_metadata || {}) })
        break
      }

      // ── Invite user via magic link email (passwordless onboarding) ──
      // Sends signup invite to the email. User clicks the link, sets
      // themselves up, and subsequent logins use 6-digit OTP only.
      case 'invite_user': {
        const { email, user_metadata, redirect_to } = params
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          email,
          {
            data: user_metadata,
            redirectTo: redirect_to,
          },
        )
        if (error) throw error
        result = { user: { id: data.user.id, email: data.user.email } }
        await writeAuditLog(data.user.id, {
          email: data.user.email,
          invite_sent: true,
          metadata_keys: Object.keys(user_metadata || {}),
        })
        break
      }

      case 'update_user': {
        const { user_id, updates } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, updates)
        if (error) throw error
        result = { user: { id: data.user.id } }
        await writeAuditLog(user_id, { updated_fields: Object.keys(updates || {}) })
        break
      }

      case 'ban_user': {
        const { user_id, duration } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          ban_duration: duration || '876000h',
        })
        if (error) throw error
        result = { banned: true }
        await writeAuditLog(user_id, { ban_duration: duration || '876000h' })
        break
      }

      case 'unban_user': {
        const { user_id } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          ban_duration: 'none',
        })
        if (error) throw error
        result = { unbanned: true }
        await writeAuditLog(user_id, {})
        break
      }

      case 'reset_password': {
        const { user_id, new_password: _pw } = params   // never log the password itself
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          password: _pw,
        })
        if (error) throw error
        result = { reset: true }
        await writeAuditLog(user_id, { note: 'password reset — value not logged' })
        break
      }

      case 'list_users': {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers()
        if (error) throw error
        result = { users: data.users.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })) }
        await writeAuditLog(null, { count: data.users.length })
        break
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
