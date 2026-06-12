import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile, UserRole } from '@/types'

interface AuthState {
  profile: UserProfile | null
  role: UserRole | null
  isLoading: boolean
  /**
   * True only after the Supabase session check has completed on mount.
   * Prevents stale localStorage data from being used before the real
   * session is verified. RoleGate should wait for this to be true.
   */
  isInitialized: boolean
  setProfile: (profile: UserProfile | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: () => void
  clearAuth: () => void
  // Permission helpers
  isOperator: () => boolean
  isAdmin: () => boolean
  isSuperAdmin: () => boolean
  hasRole: (roles: UserRole[]) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      role: null,
      isLoading: true,
      isInitialized: false,

      setProfile: (profile) =>
        set({ profile, role: profile?.role ?? null, isLoading: false }),

      setLoading: (isLoading) => set({ isLoading }),

      // Call this once the initial getSession() call resolves (success or failure).
      // RoleGate waits for this before trusting profile/role.
      setInitialized: () => set({ isInitialized: true }),

      clearAuth: () => set({ profile: null, role: null, isLoading: false }),

      isOperator: () => {
        const role = get().role
        return role === 'operator' || role === 'admin' || role === 'super_admin'
      },
      isAdmin: () => {
        const role = get().role
        return role === 'admin' || role === 'super_admin'
      },
      isSuperAdmin: () => get().role === 'super_admin',

      hasRole: (roles: UserRole[]) => {
        const role = get().role
        return role !== null && roles.includes(role)
      },
    }),
    {
      name: 'prms-auth',
      // Do NOT persist profile/role — always re-validate against Supabase on load.
      // Persisting stale role data is a security/correctness risk.
      partialize: () => ({}),
    }
  )
)
