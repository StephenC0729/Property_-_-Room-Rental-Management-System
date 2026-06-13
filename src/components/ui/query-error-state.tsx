import { AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface QueryErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function getQueryErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred. Please try again.'
}

export function QueryErrorState({
  title = 'Failed to load data',
  message,
  onRetry,
}: QueryErrorStateProps) {
  return (
    <Card className="border-red-500/20 bg-red-500/5 p-8 text-center">
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400/50" />
      <h3 className="text-sm font-semibold text-red-400">{title}</h3>
      <p className="mt-1 text-xs text-red-300/50">
        {message ?? 'An unexpected error occurred. Please try again.'}
      </p>
      {onRetry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="mt-4 text-red-400 hover:text-red-300"
        >
          Try again
        </Button>
      )}
    </Card>
  )
}
