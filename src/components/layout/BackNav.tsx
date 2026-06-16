import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BackNavProps {
  to: string
  label: string
  className?: string
}

export function BackNav({ to, label, className }: BackNavProps) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Link
      to={to}
      onClick={(e) => {
        if (location.key !== 'default') {
          e.preventDefault()
          navigate(-1)
        }
      }}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white/70 transition-colors',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  )
}
