export function MethodBadge({ method }: { method: 'cash' | 'bank_transfer' }) {
  return method === 'cash'
    ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">💵 Cash</span>
    : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">🏦 Transfer</span>
}
