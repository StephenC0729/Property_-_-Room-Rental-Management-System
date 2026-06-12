import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

interface AuthContextValue {
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setProfile, setLoading, setInitialized, clearAuth } = useAuthStore()

  useEffect(() => {
    // Check existing session on mount.
    // setInitialized() MUST be called after this resolves so RoleGate
    // stops waiting and trusts the result (whether logged in or not).
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
      setInitialized()
    })

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

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !data) {
      console.error('[auth] Failed to fetch user profile:', error)
      clearAuth()
      return
    }

    setProfile(data)
  }

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
