import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from '$env/static/public'

// Magic-link/OTP redirects land on a real browser URL with the session in
// the query/hash only on web — Capacitor opens that link in an external
// browser, not the app's webview, so there's no URL for the app to detect
// a session from there (that flow would need a native deep link handler
// instead, which doesn't exist yet). Detecting on native would just parse
// the app's own irrelevant location and never see the tokens.
const detectSessionInUrl = !Capacitor.isNativePlatform()

/**
 * Logs every request the Supabase client sends (REST reads/writes, RPCs,
 * auth) with method, path/query, status, and duration — added to chase down
 * suspected redundant network traffic. Cheap enough to leave in; remove once
 * that's diagnosed. Not a debugging shim for a single bug, just visibility
 * that was previously missing entirely.
 */
function loggingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === 'string' || input instanceof URL
      ? input.toString()
      : input.url
  const method = init?.method ?? 'GET'
  const path = url.replace(PUBLIC_SUPABASE_URL, '')
  const start = performance.now()
  console.debug(`[supabase] -> ${method} ${path}`)
  return fetch(input, init).then(
    (res) => {
      // console.debug( `[supabase] <- ${method} ${path} ${res.status} (${(performance.now() - start).toFixed(0)}ms)`, )
      return res
    },
    (err) => {
      // console.debug( `[supabase] xx ${method} ${path} failed (${(performance.now() - start).toFixed(0)}ms)`, err, )
      throw err
    },
  )
}

export const supabase = createClient(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl },
    global: { fetch: loggingFetch },
  },
)
