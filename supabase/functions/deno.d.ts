/**
 * Types for Supabase Edge Functions (Deno runtime).
 * Used by the IDE only — functions deploy and run on Supabase's Deno edge runtime.
 */

declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void

  namespace env {
    function get(key: string): string | undefined
  }
}

/** Map Deno esm.sh import to the app's installed package for editor type-checking. */
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
