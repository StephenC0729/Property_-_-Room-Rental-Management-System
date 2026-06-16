/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMOVABLE_ROLES = new Set(['admin', 'operator'])

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const { userId } = (await req.json()) as { userId?: string }
    if (!userId || typeof userId !== 'string') {
      return jsonResponse({ error: 'userId is required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error('[remove-team-member] Missing Supabase environment variables')
      return jsonResponse({ error: 'Server configuration error' }, 500)
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user: caller },
      error: callerAuthError,
    } = await supabaseUser.auth.getUser()

    if (callerAuthError || !caller) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    if (caller.id === userId) {
      return jsonResponse({ error: 'You cannot remove your own account' }, 400)
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseUser
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfileError || callerProfile?.role !== 'super_admin') {
      return jsonResponse({ error: 'Only Super Admins can remove team members' }, 403)
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single()

    if (targetError || !targetProfile) {
      return jsonResponse({ error: 'Team member not found' }, 404)
    }

    if (targetProfile.role === 'super_admin') {
      return jsonResponse(
        { error: 'Super Admin accounts must be removed in the Supabase dashboard' },
        403,
      )
    }

    if (!REMOVABLE_ROLES.has(targetProfile.role)) {
      return jsonResponse({ error: 'This account cannot be removed from the app' }, 400)
    }

    const { error: auditError } = await supabaseUser.from('audit_log').insert({
      action: 'USER_REMOVED',
      target_type: 'user_profile',
      target_id: userId,
      metadata: {
        full_name: targetProfile.full_name,
        role: targetProfile.role,
        auth_deleted: true,
      },
    })

    if (auditError) {
      console.error('[remove-team-member] Audit log insert failed:', auditError.message)
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('[remove-team-member] Auth delete failed:', deleteError.message)
      return jsonResponse({ error: deleteError.message }, 500)
    }

    return jsonResponse({ success: true }, 200)
  } catch (err) {
    console.error('[remove-team-member] Unexpected error:', err)
    return jsonResponse({ error: 'Unexpected server error' }, 500)
  }
})
