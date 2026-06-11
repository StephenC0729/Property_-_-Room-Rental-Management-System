export function InfoGrid({ items }: { items: { label: string; value: string | number | null; highlight?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map(({ label, value, highlight }) => (
        <div key={label} className="space-y-1">
          <dt className="text-xs text-muted-foreground/70">{label}</dt>
          <dd className={`text-sm font-semibold ${highlight ? 'text-violet-300' : 'text-foreground'}`}>
            {value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  )
}
