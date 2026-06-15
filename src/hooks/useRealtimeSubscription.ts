import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface PostgresChangeConfig {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  schema?: string
  table: string
  filter?: string
}

/** Stable key for postgres listener config — callbacks are excluded (handled via ref). */
function subscriptionConfigKey(subscriptions: { config: PostgresChangeConfig }[]): string {
  return JSON.stringify(
    subscriptions.map(s => ({
      event: s.config.event,
      schema: s.config.schema ?? 'public',
      table: s.config.table,
      filter: s.config.filter ?? null,
    })),
  )
}

export function useRealtimeSubscription(
  channelName: string,
  subscriptions: {
    config: PostgresChangeConfig
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (payload: RealtimePostgresChangesPayload<any>) => void
  }[]
) {
  const callbacksRef = useRef(subscriptions.map(s => s.callback))

  useEffect(() => {
    callbacksRef.current = subscriptions.map(s => s.callback)
  })

  const configKey = subscriptionConfigKey(subscriptions)

  useEffect(() => {
    let channel = supabase.channel(channelName)

    subscriptions.forEach((sub, index) => {
      channel = channel.on(
        'postgres_changes',
        { schema: 'public', ...sub.config } as any,
        (payload) => {
          callbacksRef.current[index]?.(payload)
        }
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // subscriptions read from the render where configKey changed; callbacks stay fresh via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, configKey])
}
