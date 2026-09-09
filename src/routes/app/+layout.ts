import { ready as localdbReady } from '$lib/localdb'
import { getCachedQuoteOfDayRange } from '$lib/api/quotes'

// Block first paint of /app on the local SQLite connection being open (it
// was already kicked off from hooks.client.ts, which runs even earlier —
// see the comment there — so this just waits on the same memoized promise
// rather than starting a second init). Without this, /app/daily's DayFeed
// mounts and shows a brief "Loading…"/empty state while the db is still
// opening. Scoped to /app rather than the root layout so the marketing
// page at "/" (which doesn't touch localdb) isn't held up by it.
//
// The daily feed's SQLite preload is also kicked off here, in parallel
// with (not after) localdb.ready() — getCachedQuoteOfDayRange internally
// awaits the same memoized ready() promise itself, so this doesn't start a
// second db init, it just means the query is in flight before DayFeed's
// own onMount effect would otherwise have started it. Its result is handed
// down via `data` so DayFeed can render synchronously from load data
// instead of mounting empty and fetching.
export async function load() {
  const t0 = performance.now()
  console.log('[perf] /app layout load(): awaiting localdb.ready()')
  const [, dailyQuotes] = await Promise.all([
    localdbReady(),
    getCachedQuoteOfDayRange(),
  ])
  console.log(
    `[perf] /app layout load(): localdb ready + daily preloaded, unblocking first paint at +${(performance.now() - t0).toFixed(1)}ms`,
  )
  return { dailyQuotes }
}
