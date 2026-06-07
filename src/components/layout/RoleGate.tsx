import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface RoleGateProps {
  children: React.ReactNode
  /** If omitted, any authenticated user is allowed */
  allowedRoles?: UserRole[]
}

/**
 * Wraps protected routes. Redirects to /login if unauthenticated,
 * or to /dashboard if authenticated but lacking the required role.
 */
export function RoleGate({ children, allowedRoles }: RoleGateProps) {
  const { profile, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
