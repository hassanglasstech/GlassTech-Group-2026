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
import { corsHeaders } from '../_shared/auth.ts'

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

    // Verify caller is super_admin
    const { data: { user: caller } } = await supabaseUser.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request
    const { action, ...params } = await req.json()

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
        break
      }

      case 'update_user': {
        const { user_id, updates } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, updates)
        if (error) throw error
        result = { user: { id: data.user.id } }
        break
      }

      case 'ban_user': {
        const { user_id, duration } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          ban_duration: duration || '876000h',
        })
        if (error) throw error
        result = { banned: true }
        break
      }

      case 'unban_user': {
        const { user_id } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          ban_duration: 'none',
        })
        if (error) throw error
        result = { unbanned: true }
        break
      }

      case 'reset_password': {
        const { user_id, new_password } = params
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          password: new_password,
        })
        if (error) throw error
        result = { reset: true }
        break
      }

      case 'list_users': {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers()
        if (error) throw error
        result = { users: data.users.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })) }
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
