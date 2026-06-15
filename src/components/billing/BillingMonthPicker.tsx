import { useEffect, useId, useRef, useState } from 'react'
import { CalendarDays, Pencil, X } from 'lucide-react'
import {
  filterBillingMonthOptions,
  getBillingMonthLabel,
  resolveBillingMonthQuery,
  type BillingMonthOption,
} from '@/utils/billingMonth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BillingMonthSearchProps {
  value: string
  options: BillingMonthOption[]
  onChange: (value: string) => void
  onDone?: () => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

function BillingMonthSearch({
  value,
  options,
  onChange,
  onDone,
  placeholder = 'Search month, e.g. January 2025 or 2025-01',
  className,
  autoFocus,
}: BillingMonthSearchProps) {
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(() => getBillingMonthLabel(value, options))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) setQuery(getBillingMonthLabel(value, options))
  }, [value, options, open])

  const suggestions = open
    ? filterBillingMonthOptions(options, query).slice(0, 8)
    : []

  function commitSelection(nextValue: string) {
    onChange(nextValue)
    setQuery(getBillingMonthLabel(nextValue, options))
    setOpen(false)
    onDone?.()
  }

  function commitQuery() {
    const resolved = resolveBillingMonthQuery(query, options)
    if (resolved) {
      commitSelection(resolved)
      return
    }
    setQuery(getBillingMonthLabel(value, options))
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        <Input
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (!containerRef.current?.contains(document.activeElement)) {
                commitQuery()
              }
            }, 120)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitQuery()
            }
            if (e.key === 'Escape') {
              setQuery(getBillingMonthLabel(value, options))
              setOpen(false)
              onDone?.()
            }
          }}
          className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/50 h-10"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {suggestions.map(option => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/5',
                  option.value === value ? 'text-violet-300 bg-violet-500/10' : 'text-foreground',
                )}
                onMouseDown={e => e.preventDefault()}
                onClick={() => commitSelection(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export interface BillingMonthPickerProps {
  value: string
  onChange: (value: string) => void
  options: BillingMonthOption[]
  /** Reports: always searchable. Payments: compact until "Change month". */
  mode?: 'search' | 'compact'
  className?: string
}

export function BillingMonthPicker({
  value,
  onChange,
  options,
  mode = 'search',
  className,
}: BillingMonthPickerProps) {
  const [editing, setEditing] = useState(false)
  const label = getBillingMonthLabel(value, options)

  if (mode === 'search') {
    return (
      <BillingMonthSearch
        value={value}
        options={options}
        onChange={onChange}
        className={className}
      />
    )
  }

  if (!editing) {
    return (
      <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2.5', className)}>
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 h-8 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setEditing(true)}
        >
          <Pencil className="mr-1 h-3 w-3" /> Change month
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <BillingMonthSearch
        value={value}
        options={options}
        onChange={onChange}
        autoFocus
        onDone={() => setEditing(false)}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(false)}
      >
        <X className="mr-1 h-3 w-3" /> Cancel
      </Button>
    </div>
  )
}
