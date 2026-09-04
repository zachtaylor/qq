import type { Quote } from '$lib/types'

type FeedKey = 'day' | 'random' | 'trending'

interface FeedEntry {
  quotes: Quote[]
  scrollTop: number
  fetchedAt: number
}

/** How long a cached feed is considered fresh enough to skip refetching on
 *  remount — e.g. leaving /app/random for a quote detail page and coming
 *  back shouldn't re-roll the random list, only a real return visit later
 *  (or an explicit pull-to-refresh) should. */
export const FEED_STALE_MS = 3 * 60 * 60 * 1000

const entries = new Map<FeedKey, FeedEntry>()

export const feedCache = {
  get(key: FeedKey): FeedEntry | undefined {
    return entries.get(key)
  },
  isStale(key: FeedKey, maxAgeMs = FEED_STALE_MS): boolean {
    const existing = entries.get(key)
    if (!existing || existing.quotes.length === 0) return true
    return Date.now() - existing.fetchedAt > maxAgeMs
  },
  set(key: FeedKey, quotes: Quote[]): void {
    const existing = entries.get(key)
    entries.set(key, {
      quotes,
      scrollTop: existing?.scrollTop ?? 0,
      fetchedAt: Date.now(),
    })
  },
  setScroll(key: FeedKey, scrollTop: number): void {
    const existing = entries.get(key)
    if (existing) existing.scrollTop = scrollTop
    else entries.set(key, { quotes: [], scrollTop, fetchedAt: 0 })
  },
}

export type { FeedKey }
