import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface RemoveTeamMemberResponse {
  success?: boolean
  error?: string
}

async function getInvokeErrorMessage(error: FunctionsHttpError): Promise<string> {
  try {
    const body = await error.context.json() as RemoveTeamMemberResponse
    if (body.error) return body.error
  } catch {
    // Response body was not JSON — fall through to generic message
  }
  return error.message || 'Failed to remove team member'
}

/**
 * Permanently removes an admin or operator via the remove-team-member Edge Function.
 * Deletes their Supabase Auth account; user_profiles cascades automatically.
 * Super Admin accounts cannot be removed through this path.
 */
export async function removeTeamMember(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<RemoveTeamMemberResponse>(
    'remove-team-member',
    { body: { userId } },
  )

  if (error instanceof FunctionsHttpError) {
    throw new Error(await getInvokeErrorMessage(error))
  }

  if (error) {
    throw new Error(error.message || 'Failed to remove team member')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  if (!data?.success) {
    throw new Error('Failed to remove team member')
  }
}
