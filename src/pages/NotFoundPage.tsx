import { Link } from 'react-router-dom'
import { Building2, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
      </div>

      <Card className="relative w-full max-w-md border-border bg-card p-8 text-center shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl bg-violet-500/30 blur-lg" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg">
              <Building2 className="h-7 w-7 text-foreground" />
            </div>
          </div>
          <p className="text-6xl font-bold text-foreground tracking-tight">404</p>
          <h1 className="mt-2 text-xl font-semibold text-foreground">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or may have been moved.
          </p>
        </div>

        <Button asChild className="w-full bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20">
          <Link to="/dashboard">
            <Home className="mr-2 h-4 w-4" /> Go to Dashboard
          </Link>
        </Button>
      </Card>
    </div>
  )
}
