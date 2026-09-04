import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { defineCustomElements as initJeepSqlite } from 'jeep-sqlite/loader'
import {
  getDailyTime,
  registerNotificationTapHandler,
  scheduleDaily,
} from '$lib/notifications'

// Must run before any load() calls into localdb.ts, which awaits
// customElements.whenDefined('jeep-sqlite') — hooks.client.ts runs at
// module scope ahead of the load waterfall, unlike +layout.svelte's
// instance script, which only executes once the layout component mounts
// (i.e. after load() already resolved). Registering it here instead of
// there broke this exact ordering once already (see git history on
// src/routes/q/[id]/+page.ts).
if (!Capacitor.isNativePlatform()) initJeepSqlite(window)

// Capacitor's default Android back-button behavior exits the app instead
// of navigating SvelteKit's history — there's no built-in bridge between
// the hardware button and the SPA router, so it has to be wired up
// explicitly. `canGoBack` reflects the *webview's* session history, which
// tracks SvelteKit's client-side navigations too, so this is enough to
// fall back to instead of exiting once there's nowhere left to go back to.
if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) history.back()
    else App.exitApp()
  })

  registerNotificationTapHandler()

  // Re-top-up the notification window on every app launch: scheduleDaily()
  // only ever schedules real quote_of_the_day pairings that already exist
  // (see supabase/cron.sql), so the rolling window needs a periodic nudge
  // forward rather than being computed once and left to run out.
  const daily = getDailyTime()
  if (daily) scheduleDaily(daily.hour, daily.minute)

  // App is light-mode only, so the status bar should show dark icons/text
  // — `Style.Light` is Capacitor's name for "content is dark, for use on a
  // light background", the inverse of what it sounds like. No
  // setBackgroundColor call: targetSdk 36 (Android 15+) enforces
  // edge-to-edge and silently ignores it — the status bar is transparent
  // by OS mandate, so it just shows through to the page's own background
  // (src/app.css `html, body` is already #fafaf9) instead. This only
  // shows through correctly because app.html's viewport meta includes
  // `viewport-fit=cover` — without it, `env(safe-area-inset-top)`
  // resolves to 0 and the layout viewport doesn't extend under the status
  // bar, so the WebView renders a dark system scrim there instead.
  StatusBar.setStyle({ style: Style.Light })
}
