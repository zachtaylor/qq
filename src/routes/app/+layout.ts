import { ready as localdbReady } from '$lib/localdb'
import { getCachedQuoteOfDayRange, getCachedRandomFeed } from '$lib/api/quotes'
import { getCachedTrending } from '$lib/localdb'
import { fetchUserContentBundle } from '$lib/api/userContent'
import { ready } from '$lib/stores/session.svelte'
import { userContentCache } from '$lib/stores/userContentCache.svelte'
import { feedCache } from '$lib/stores/feedCache.svelte'

// Blocks first paint of /app until localdb, auth, and daily/likes/downloads
// data are ready, so the tab bar and Settings render real content instead of
// a spinner. Scoped to /app (not the root layout, so "/" isn't held up; not
// /app/tabs, since routes like /app/q/[id] can be landed on directly via a
// deep link without ever mounting /app/tabs). app.html's boot loading screen
// stays up until this resolves — see fadeOutBootLoading() in +layout.svelte.
export async function load() {
  console.debug('[boot] app/+layout.ts load start', performance.now())
  await Promise.all([localdbReady(), ready])
  console.debug('[boot] localdb + auth ready', performance.now())

  // Random/trending are seeded from the local SQLite mirror only; QuoteFeed
  // itself reconciles against the network on mount.
  const [dailyQuotes] = await Promise.all([
    getCachedQuoteOfDayRange(),
    getCachedRandomFeed().then((quotes) => {
      if (quotes.length > 0) feedCache.set('random', quotes)
    }),
    getCachedTrending().then((quotes) => {
      if (quotes.length > 0) feedCache.set('trending', quotes)
    }),
    fetchUserContentBundle().then(({ likes, downloads }) => {
      userContentCache.setLikes(likes)
      userContentCache.setDownloads(downloads)
    }),
  ])
  console.debug('[boot] app/+layout.ts load done', performance.now())
  return { dailyQuotes }
}
