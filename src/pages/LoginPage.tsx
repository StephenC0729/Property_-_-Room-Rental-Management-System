import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Building2, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Incorrect email or password. Please try again.'
          : authError.message
      )
      setIsLoading(false)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[300px] rounded-full bg-purple-600/10 blur-[80px]" />
      </div>

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Login Card */}
      <div className="relative w-full max-w-md">

        {/* Card glow border */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

        <div className="relative rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/8 p-8 shadow-2xl">

          {/* Logo & Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-2xl bg-violet-500/30 blur-lg" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg">
                <Building2 className="h-7 w-7 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">PRMS</h1>
            <p className="mt-1 text-sm text-white/40">Property & Room Rental Management</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-white/60">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20
                             focus:border-violet-500/60 focus:ring-violet-500/20 h-11"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-white/60">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/20
                             focus:border-violet-500/60 focus:ring-violet-500/20 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-gradient-to-r from-violet-600 to-indigo-600
                         hover:from-violet-500 hover:to-indigo-500
                         text-white font-semibold shadow-lg shadow-violet-500/25
                         transition-all duration-200 hover:shadow-violet-500/40 hover:-translate-y-px
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Footer note */}
          <p className="mt-6 text-center text-xs text-white/20">
            Access is restricted to authorised team members only.
          </p>
        </div>

        {/* Location tag */}
        <p className="mt-4 text-center text-xs text-white/15">
          Tawau, Sabah · Kuala Lumpur
        </p>
      </div>
    </div>
  )
}
