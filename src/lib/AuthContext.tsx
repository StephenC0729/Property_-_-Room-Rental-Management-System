import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { expireOverdueLeases } from '@/lib/leases'

interface AuthContextValue {
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setProfile, setInitialized, clearAuth } = useAuthStore()

  useEffect(() => {
    // Drop any legacy persisted auth data from before profile/role were removed
    // from the store. Safe to call even when the key is already absent.
    localStorage.removeItem('prms-auth')

    let cancelled = false

    async function fetchProfile(userId: string) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (cancelled) return

      if (error || !data) {
        console.error('[auth] Failed to fetch user profile:', error)
        clearAuth()
        return
      }

      setProfile(data)
      await expireOverdueLeases(data.role)
    }

    // Check existing session on mount. setInitialized() MUST run in finally so
    // RoleGate never spins forever if getSession() or fetchProfile() fails.
    async function initSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (cancelled) return

        if (error) throw error

        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          clearAuth()
        }
      } catch (err) {
        console.error('[auth] Session check failed:', err)
        clearAuth()
      } finally {
        if (!cancelled) setInitialized()
      }
    }

    void initSession()

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await fetchProfile(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          clearAuth()
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [setProfile, setInitialized, clearAuth])

  async function signOut() {
    clearAuth()
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within <AuthProvider>')
  return context
}
