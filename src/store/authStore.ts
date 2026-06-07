import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile, UserRole } from '@/types'

interface AuthState {
  profile: UserProfile | null
  role: UserRole | null
  isLoading: boolean
  setProfile: (profile: UserProfile | null) => void
  setLoading: (loading: boolean) => void
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

      setProfile: (profile) =>
        set({ profile, role: profile?.role ?? null, isLoading: false }),

      setLoading: (isLoading) => set({ isLoading }),

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
      partialize: (state) => ({ profile: state.profile, role: state.role }),
    }
  )
)
