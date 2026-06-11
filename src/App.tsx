import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/lib/AuthContext'
import { RoleGate } from '@/components/layout/RoleGate'
import { AppLayout } from '@/components/layout/AppLayout'
import { ThemeProvider } from '@/components/theme-provider'

// Pages
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { PropertiesPage } from '@/pages/PropertiesPage'
import { PropertyRoomMatrixPage } from '@/pages/PropertyRoomMatrixPage'
import { TenantsPage } from '@/pages/TenantsPage'
import { TenantProfilePage } from '@/pages/TenantProfilePage'
import { NewTenantPage } from '@/pages/NewTenantPage'
import { LeasesPage } from '@/pages/LeasesPage'
import { LeaseDetailPage } from '@/pages/LeaseDetailPage'
import { NewLeasePage } from '@/pages/NewLeasePage'
import { ReportsPage } from '@/pages/ReportsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="prms-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <BrowserRouter>
              <Routes>
                {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected — all authenticated users */}
              <Route element={<RoleGate><AppLayout /></RoleGate>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/properties" element={<PropertiesPage />} />
                <Route path="/properties/:id" element={<PropertyRoomMatrixPage />} />

                {/* Admin+ only */}
                <Route
                  path="/tenants"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><TenantsPage /></RoleGate>}
                />
                <Route
                  path="/tenants/new"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><NewTenantPage /></RoleGate>}
                />
                <Route
                  path="/tenants/:id"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><TenantProfilePage /></RoleGate>}
                />
                <Route
                  path="/leases"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><LeasesPage /></RoleGate>}
                />
                <Route
                  path="/leases/new"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><NewLeasePage /></RoleGate>}
                />
                <Route
                  path="/leases/:id"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><LeaseDetailPage /></RoleGate>}
                />
                <Route
                  path="/reports"
                  element={<RoleGate allowedRoles={['admin', 'super_admin']}><ReportsPage /></RoleGate>}
                />

                {/* Super Admin only */}
                <Route
                  path="/audit-log"
                  element={<RoleGate allowedRoles={['super_admin']}><AuditLogPage /></RoleGate>}
                />
                <Route
                  path="/settings"
                  element={<RoleGate allowedRoles={['super_admin']}><SettingsPage /></RoleGate>}
                />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}
