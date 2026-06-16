import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import {
  Building2, LayoutDashboard, Users, FileText,
  BarChart3, ClipboardList, Settings, LogOut, MoreHorizontal,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/lib/AuthContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  superAdminOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/properties',  label: 'Properties',  icon: Building2 },
  { to: '/tenants',     label: 'Tenants',     icon: Users,         adminOnly: true },
  { to: '/leases',      label: 'Leases',      icon: FileText,      adminOnly: true },
  { to: '/reports',     label: 'Reports',     icon: BarChart3,     adminOnly: true },
  { to: '/audit-log',   label: 'Audit Log',   icon: ClipboardList, superAdminOnly: true },
  { to: '/settings',    label: 'Settings',    icon: Settings,      superAdminOnly: true },
]

const MOBILE_TAB_LIMIT = 5

function isNavItemActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function MobileBottomNav({ items }: { items: NavItem[] }) {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const needsMore = items.length > MOBILE_TAB_LIMIT
  const primaryItems = needsMore ? items.slice(0, MOBILE_TAB_LIMIT - 1) : items
  const overflowItems = needsMore ? items.slice(MOBILE_TAB_LIMIT - 1) : []
  const isOverflowActive = overflowItems.some((item) =>
    isNavItemActive(location.pathname, item.to),
  )

  const tabClass = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
      active ? 'text-primary' : 'text-muted-foreground',
    )

  return (
    <>
      <nav className="md:hidden flex border-t border-border bg-card">
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => tabClass(isActive)}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}

        {needsMore && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={tabClass(moreOpen || isOverflowActive)}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        )}
      </nav>

      {needsMore && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
            <SheetHeader className="pb-2">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1">
              {overflowItems.map((item) => {
                const active = isNavItemActive(location.pathname, item.to)
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

export function AppLayout() {
  const { profile } = useAuthStore()
  const { signOut } = useAuth()

  const visibleItems = navItems.filter(item => {
    if (item.superAdminOnly) return profile?.role === 'super_admin'
    if (item.adminOnly) return profile?.role === 'admin' || profile?.role === 'super_admin'
    return true
  })

  const initials = profile?.full_name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() ?? '?'

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">PRMS</p>
            <p className="text-[10px] text-muted-foreground">Rental Management</p>
          </div>
        </div>

        <Separator />

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <Separator />

        {/* User Footer */}
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{profile?.full_name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">
              {profile?.role?.replace('_', ' ')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">PRMS</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <MobileBottomNav items={visibleItems} />
      </div>
    </div>
  )
}
