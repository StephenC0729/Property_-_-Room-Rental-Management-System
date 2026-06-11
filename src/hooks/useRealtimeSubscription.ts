import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export interface PostgresChangeConfig {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  schema?: string
  table: string
  filter?: string
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

  useEffect(() => {
    let channel = supabase.channel(channelName)

    subscriptions.forEach((sub, index) => {
      channel = channel.on(
        'postgres_changes',
        { schema: 'public', ...sub.config } as any,
        (payload) => {
          if (callbacksRef.current[index]) {
            callbacksRef.current[index](payload)
          }
        }
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]) // only re-subscribe if channel name changes
}
