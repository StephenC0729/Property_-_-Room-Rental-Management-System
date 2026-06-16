import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface TruncatedTextProps {
  children: string
  className?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function TruncatedText({ children, className, side = 'top' }: TruncatedTextProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn('block truncate', className)} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-sm whitespace-normal">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
