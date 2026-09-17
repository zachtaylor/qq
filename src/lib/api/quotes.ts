import { supabase } from '$lib/supabase'
import { auth, ensureDeviceId } from '$lib/stores/session.svelte'
import { network } from '$lib/stores/network.svelte'
import { userContentCache } from '$lib/stores/userContentCache.svelte'
import * as localdb from '$lib/localdb'
import type { CardStyle } from '$lib/shareCard'
import type { Author, QQuote, Tag } from '$lib/types'

const QUOTE_SELECT =
  'id, text, author_id, created_at, like_count, downloads_count, likes(device_id, user_id), quote_tags(tag_id)'

function byPopularity(a: QQuote, b: QQuote): number {
  return b.like_count + b.downloads_count - (a.like_count + a.downloads_count)
}

export function sortByPopularity(quotes: QQuote[]): QQuote[] {
  return [...quotes].sort(byPopularity)
}

// Fetches full rows for whichever author/tag ids aren't already in the local cache
async function backfillAuthorsAndTags(
  authorIds: string[],
  tagIds: string[],
): Promise<{ authorsById: Map<string, Author>; tagsById: Map<string, Tag> }> {
  const [cachedAuthors, cachedTags] = await Promise.all([
    localdb.getCachedAuthorsByIds(authorIds),
    localdb.getCachedTagsByIds(tagIds),
  ])

  const missingAuthorIds = authorIds.filter((id) => !cachedAuthors.has(id))
  const missingTagIds = tagIds.filter((id) => !cachedTags.has(id))

  const [authorRows, tagRows] = await Promise.all([
    missingAuthorIds.length > 0
      ? supabase
          .from('authors')
          .select('id, name, slug, bio, portrait_url, born_year, died_year')
          .in('id', missingAuthorIds)
          .then(({ data, error }) => {
            if (error) throw error
            return data as Author[]
          })
      : Promise.resolve<Author[]>([]),
    missingTagIds.length > 0
      ? supabase
          .from('tags')
          .select('id, name, slug')
          .in('id', missingTagIds)
          .then(({ data, error }) => {
            if (error) throw error
            return data as Tag[]
          })
      : Promise.resolve<Tag[]>([]),
  ])

  for (const author of authorRows) cachedAuthors.set(author.id, author)
  for (const tag of tagRows) cachedTags.set(tag.id, tag)

  return { authorsById: cachedAuthors, tagsById: cachedTags }
}

async function hydrateQuoteRows(rows: any[]): Promise<QQuote[]> {
  const authorIds = [...new Set(rows.map((row) => row.author_id as string))]
  const tagIds = [
    ...new Set(
      rows.flatMap((row) =>
        ((row.quote_tags ?? []) as { tag_id: string }[]).map((qt) => qt.tag_id),
      ),
    ),
  ]
  const { authorsById, tagsById } = await backfillAuthorsAndTags(
    authorIds,
    tagIds,
  )

  return rows.map((row) => {
    const likes: { device_id: string | null; user_id: string | null }[] =
      row.likes ?? []
    const quoteTags: { tag_id: string }[] = row.quote_tags ?? []
    return {
      id: row.id,
      text: row.text,
      author_id: row.author_id,
      author: authorsById.get(row.author_id)!,
      created_at: row.created_at,
      tags: quoteTags
        .map((qt) => tagsById.get(qt.tag_id))
        .filter((t): t is Tag => t != null),
      like_count: row.like_count,
      liked_by_me: likes.some(
        (l) =>
          (auth.userId && l.user_id === auth.userId) ||
          (!auth.userId && l.device_id === auth.deviceId),
      ),
      downloads_count: row.downloads_count,
    }
  })
}

/** The persisted random-feed roll from local SQLite, with no network trip — meant to be used like a page load function so a fresh mount can render instantly instead of showing a spinner. */
export async function getCachedRandomFeed(limit = 50): Promise<QQuote[]> {
  return localdb.getCachedRandomFeed(limit)
}

/** How long the persisted random feed is considered fresh enough to skip a
 *  network re-roll — this is checked against SQLite (not the in-memory
 *  feedCache), since feedCache resets on every cold app start but the
 *  random feed roll itself should persist across restarts too. */
export const RANDOM_FEED_STALE_MS = 3 * 60 * 60 * 1000

/**
 * Fetches a fresh random feed, unless `force` is false and the persisted
 * roll is still within RANDOM_FEED_STALE_MS — in which case the existing
 * persisted roll is returned as-is (no network call, no reshuffle).
 * `force: true` (pull-to-refresh) always re-rolls.
 */
export async function fetchRandomFeed(
  limit = 50,
  force = false,
): Promise<QQuote[]> {
  if (network.offline) return localdb.getCachedRandomFeed(limit)
  if (!force) {
    const age = await localdb.getRandomFeedAge()
    if (age !== null && age < RANDOM_FEED_STALE_MS) {
      const cached = await localdb.getCachedRandomFeed(limit)
      if (cached.length > 0) return cached
    }
  }
  const { data, error } = await supabase.rpc('random_quotes', {
    max_rows: limit,
    p_device_id: auth.userId ? null : auth.deviceId,
  })
  if (error) throw error
  const rows = data as any[]
  const authorIds = [...new Set(rows.map((row) => row.author_id as string))]
  const { authorsById } = await backfillAuthorsAndTags(authorIds, [])
  const quotes = rows.map((row) => trendingRowToQuote(row, authorsById))
  await localdb.cacheRandomFeed(quotes)
  return quotes
}

/** YYYY-MM-DD for `daysAgo` days before today, in local time (matches how the daily notification lands for the user). */
function dateDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toLocaleDateString('en-CA')
}

export const MAX_QUOTE_OF_DAY_DAYS = 14

/** The last `days` YYYY-MM-DD dates (today plus `days - 1` prior days), clamped to `MAX_QUOTE_OF_DAY_DAYS`. */
function quoteOfDayDates(days: number): string[] {
  const count = Math.min(days, MAX_QUOTE_OF_DAY_DAYS)
  return Array.from({ length: count }, (_, i) => dateDaysAgo(i))
}

/**
 * Reads the last `days` quotes-of-the-day straight from the local SQLite
 * cache, with no network trip at all — meant to be used like a page load
 * function, so a fresh mount can render instantly from disk instead of
 * showing a spinner while `fetchQuoteOfDayRange` decides whether a network
 * refresh is needed.
 */
export async function getCachedQuoteOfDayRange(
  days = MAX_QUOTE_OF_DAY_DAYS,
): Promise<QQuote[]> {
  const dates = quoteOfDayDates(days)
  const byDate = await localdb.getCachedQuoteOfDayRange(
    dates[dates.length - 1],
    dates[0],
  )
  const quotes = dates
    .map((d) => byDate.get(d))
    .filter((q): q is QQuote => q != null)
  return quotes
}

/**
 * Fetches the last `days` quotes-of-the-day (today plus `days - 1` prior
 * days), clamped to `MAX_QUOTE_OF_DAY_DAYS`. If every requested day
 * (including today) is already in the local cache, returns straight from
 * there with no network trip — the (date -> quote) pairing is immutable
 * once pg_cron assigns it (see supabase/cron.sql,
 * ensure_quote_of_the_day()), so there's nothing to refresh by re-fetching
 * today. Any day still missing from the cache is resolved with a single
 * batched read of quote_of_the_day (joined to quotes) instead of one
 * request per day.
 */
export async function fetchQuoteOfDayRange(
  days = MAX_QUOTE_OF_DAY_DAYS,
): Promise<QQuote[]> {
  const dates = quoteOfDayDates(days)

  const cachedByDate = await localdb.getCachedQuoteOfDayRange(
    dates[dates.length - 1],
    dates[0],
  )
  const needed = dates.filter((d) => !cachedByDate.has(d))

  if (needed.length === 0 || network.offline) {
    return dates
      .map((d) => cachedByDate.get(d))
      .filter((q): q is QQuote => q != null)
  }

  const { data: rangeRows, error } = await supabase
    .from('quote_of_the_day')
    .select(`date, quote:quotes(${QUOTE_SELECT})`)
    .in('date', needed)
  if (error) throw error

  const presentRows = (
    rangeRows as unknown as { date: string; quote: any }[]
  ).filter((row) => row.quote)
  const freshQuotes = await hydrateQuoteRows(
    presentRows.map((row) => row.quote),
  )

  const cacheWrites: Promise<void>[] = []
  freshQuotes.forEach((quote, i) => {
    const date = presentRows[i].date
    cachedByDate.set(date, quote)
    cacheWrites.push(localdb.cacheQuoteOfDay(date, quote))
  })
  if (freshQuotes.length > 0) cacheWrites.push(localdb.cacheQuotes(freshQuotes))
  await Promise.all(cacheWrites)

  return dates
    .map((d) => cachedByDate.get(d))
    .filter((q): q is QQuote => q != null)
}

/** Row shape returned by the trending_quotes() RPC — full quote content in
 *  one round trip (see supabase/migrations/0013_trending_quotes_with_content.sql),
 *  so no follow-up `quotes` select (and no expensive per-row likes array)
 *  is needed just to render the list. Sort order still comes from the
 *  windowed recent_like_count/recent_download_count; cards themselves
 *  display the lifetime like_count/downloads_count columns. */
function trendingRowToQuote(
  row: any,
  authorsById: Map<string, Author>,
): QQuote {
  return {
    id: row.id,
    text: row.text,
    author_id: row.author_id,
    author: authorsById.get(row.author_id)!,
    created_at: row.created_at,
    tags: row.tags ?? [],
    like_count: row.like_count,
    liked_by_me: row.liked_by_me,
    downloads_count: row.downloads_count,
  }
}

/** The persisted trending quotes from local SQLite, with no network trip —
 *  meant to be used like a page load function so a fresh mount can render
 *  instantly instead of showing a spinner while fetchTrending() reconciles. */
export async function getCachedTrending(limit = 25): Promise<QQuote[]> {
  return localdb.getCachedTrending(limit)
}

export async function fetchTrending(limit = 25): Promise<QQuote[]> {
  if (network.offline) return localdb.getCachedTrending(limit)
  const { data, error } = await supabase.rpc('trending_quotes', {
    max_rows: limit,
    p_device_id: auth.userId ? null : auth.deviceId,
  })
  if (error) throw error
  const rows = data as any[]
  const authorIds = [...new Set(rows.map((row) => row.author_id as string))]
  const { authorsById } = await backfillAuthorsAndTags(authorIds, [])
  const quotes = rows.map((row) => trendingRowToQuote(row, authorsById))
  // Awaited (not fire-and-forget) so callers that need the local cache
  // count to be accurate immediately after (e.g. Settings' "clear cache"
  // reload) aren't racing this write.
  await localdb.cacheQuotes(quotes)
  return quotes
}

/** How long an author's cached quote list is considered fresh enough to
 *  skip a network refetch — checked against SQLite (per-author, via
 *  localdb's _meta table), same pattern as RANDOM_FEED_STALE_MS. */
export const AUTHOR_QUOTES_STALE_MS = 30 * 60 * 1000

/**
 * Fetches an author's quotes, unless `force` is false and the cached list
 * is still within AUTHOR_QUOTES_STALE_MS — in which case the cached list
 * is returned as-is (no network call). `force: true` always refetches.
 */
export async function fetchQuotesByAuthor(
  authorId: string,
  force = false,
  limit = 25,
): Promise<QQuote[]> {
  if (network.offline) {
    return (await localdb.getCachedQuotesByAuthor(authorId))
      .sort(byPopularity)
      .slice(0, limit)
  }
  if (!force) {
    const age = await localdb.getAuthorQuotesAge(authorId)
    if (age !== null && age < AUTHOR_QUOTES_STALE_MS) {
      const cached = await localdb.getCachedQuotesByAuthor(authorId)
      if (cached.length > 0) return cached.sort(byPopularity).slice(0, limit)
    }
  }
  const { data, error } = await supabase.rpc('quotes_by_author', {
    p_author_id: authorId,
    max_rows: limit,
    p_device_id: auth.userId ? null : auth.deviceId,
  })
  if (error) throw error
  const rows = data as any[]
  const authorIds = [...new Set(rows.map((row) => row.author_id as string))]
  const { authorsById } = await backfillAuthorsAndTags(authorIds, [])
  const quotes = rows.map((row) => trendingRowToQuote(row, authorsById))
  localdb.cacheQuotes(quotes)
  localdb.markAuthorQuotesFetched(authorId)
  return quotes
}

export async function recordDownload(
  quoteId: string,
  style: CardStyle,
): Promise<void> {
  if (network.offline) throw new Error('Downloads are unavailable offline')
  const userId = auth.userId
  const identity = userId
    ? { user_id: userId }
    : { device_id: await ensureDeviceId() }
  const { error } = await supabase
    .from('downloads')
    .insert({ quote_id: quoteId, style, ...identity })
  if (error) throw error
  localdb.bumpDownloadsCount(quoteId)
  localdb.recordLocalDownload(quoteId, style)
  userContentCache.invalidate()
  window.umami?.track('download', { quote_id: quoteId, style })
}

/** Resolves a quote from SQLite first, then reconciles from the network when needed. */
export async function fetchQuoteById(quoteId: string): Promise<QQuote | null> {
  const cached = await localdb.getCachedQuote(quoteId)
  if (cached || network.offline) return cached

  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .eq('id', quoteId)
    .maybeSingle()
  if (error) throw error
  const quote = data ? (await hydrateQuoteRows([data]))[0] : null
  if (quote) await localdb.cacheQuotes([quote])
  return quote
}

export async function setLiked(quoteId: string, liked: boolean): Promise<void> {
  if (network.offline) throw new Error('Likes are unavailable offline')
  const userId = auth.userId
  const identity = userId
    ? { user_id: userId }
    : { device_id: await ensureDeviceId() }
  if (liked) {
    const { error } = await supabase
      .from('likes')
      .upsert({ quote_id: quoteId, ...identity })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('quote_id', quoteId)
      .match(identity)
    if (error) throw error
  }
  localdb.setCachedLiked(quoteId, liked)
  userContentCache.invalidate()
  window.umami?.track(liked ? 'like' : 'unlike', { quote_id: quoteId })
}

/** How long a tag's cached quote list is considered fresh enough to skip a
 *  network refetch — checked against SQLite (per-tag, via localdb's _meta
 *  table), same pattern as AUTHOR_QUOTES_STALE_MS. */
export const TAG_QUOTES_STALE_MS = 30 * 60 * 1000

/**
 * Fetches a tag's quotes, unless `force` is false and the cached list is
 * still within TAG_QUOTES_STALE_MS — in which case the cached list is
 * returned as-is (no network call). `force: true` always refetches.
 */
export async function fetchQuotesByTag(
  tagSlug: string,
  force = false,
  limit = 25,
): Promise<QQuote[]> {
  if (network.offline) {
    return (await localdb.getCachedQuotesByTag(tagSlug))
      .sort(byPopularity)
      .slice(0, limit)
  }
  if (!force) {
    const age = await localdb.getTagQuotesAge(tagSlug)
    if (age !== null && age < TAG_QUOTES_STALE_MS) {
      const cached = await localdb.getCachedQuotesByTag(tagSlug)
      if (cached.length > 0) return cached.sort(byPopularity).slice(0, limit)
    }
  }
  const { data, error } = await supabase.rpc('quotes_by_tag', {
    p_tag_slug: tagSlug,
    max_rows: limit,
    p_device_id: auth.userId ? null : auth.deviceId,
  })
  if (error) throw error
  const rows = data as any[]
  const authorIds = [...new Set(rows.map((row) => row.author_id as string))]
  const { authorsById } = await backfillAuthorsAndTags(authorIds, [])
  const quotes = rows.map((row) => trendingRowToQuote(row, authorsById))
  localdb.cacheQuotes(quotes)
  localdb.markTagQuotesFetched(tagSlug)
  return quotes
}

/**
 * Cache-only counterpart to fetchSimilarQuotes() — same tag-first/
 * same-author-fallback logic, but reads only the local SQLite cache, never
 * the network. Meant for a page load() so first paint isn't blocked on a
 * network round-trip; callers should follow up with fetchSimilarQuotes()
 * (e.g. in onMount) to refresh in the background.
 */
export async function getCachedSimilarQuotes(
  quote: Pick<QQuote, 'id' | 'author_id' | 'tags'>,
  limit = 10,
): Promise<QQuote[]> {
  if (quote.tags.length > 0) {
    const byTag = await Promise.all(
      quote.tags.map((tag) => localdb.getCachedQuotesByTag(tag.slug)),
    )
    const seen = new Map<string, QQuote>()
    for (const list of byTag) {
      for (const q of list) if (q.id !== quote.id) seen.set(q.id, q)
    }
    if (seen.size > 0) {
      return [...seen.values()].sort(byPopularity).slice(0, limit)
    }
  }

  const sameAuthor = (
    await localdb.getCachedQuotesByAuthor(quote.author_id)
  ).filter((q) => q.id !== quote.id)
  return sameAuthor.sort(byPopularity).slice(0, limit)
}

/**
 * Tag-first: when the quote has tags, prefer other quotes sharing a tag
 * over same-author quotes — subject match is a better "related" signal
 * than authorship. Falls back to same-author quotes when the quote has no
 * tags or the tag pull comes up empty.
 *
 * Reuses fetchQuotesByTag()/fetchQuotesByAuthor() rather than querying
 * Supabase directly, so "similar quotes" shares the same cache-first +
 * staleness-gated (TAG_QUOTES_STALE_MS / AUTHOR_QUOTES_STALE_MS) recency
 * pulls as the tag and author pages instead of re-fetching independently.
 */
export async function fetchSimilarQuotes(
  quote: Pick<QQuote, 'id' | 'author_id' | 'tags'>,
  limit = 10,
): Promise<QQuote[]> {
  if (quote.tags.length > 0) {
    const byTag = await Promise.all(
      quote.tags.map((tag) => fetchQuotesByTag(tag.slug).catch(() => [])),
    )
    const seen = new Map<string, QQuote>()
    for (const list of byTag) {
      for (const q of list) if (q.id !== quote.id) seen.set(q.id, q)
    }
    if (seen.size > 0) {
      return [...seen.values()].sort(byPopularity).slice(0, limit)
    }
  }

  const sameAuthor = (await fetchQuotesByAuthor(quote.author_id)).filter(
    (q) => q.id !== quote.id,
  )
  return sameAuthor.sort(byPopularity).slice(0, limit)
}

export async function randomQuote(): Promise<{
  text: string
  author: string
} | null> {
  const { data } = await supabase.rpc('random_quote').single()
  if (!data) return null
  const d = data as { text: string; author_name: string }
  return { text: d.text, author: d.author_name }
}

export const DATA_PACK_LIMIT = 2000
const DATA_PACK_SEARCH_COUNT = 3

function randomQuoteRowToQuote(row: any): QQuote {
  return {
    id: row.id,
    text: row.text,
    author_id: row.author_id,
    author: {
      id: row.author_id,
      name: row.author_name,
      slug: row.author_slug,
      portrait_url: row.author_portrait_url,
      bio: null,
      born_year: null,
      died_year: null,
    },
    created_at: row.created_at,
    tags: row.tags ?? [],
    like_count: row.like_count,
    liked_by_me: false,
    downloads_count: row.downloads_count,
  }
}

export async function downloadDataPack(): Promise<number> {
  if (network.offline) throw new Error('Data pack requires a connection')
  const quotesById = new Map<string, QQuote>()
  for (let call = 0; call < DATA_PACK_SEARCH_COUNT; call++) {
    const { data, error } = await supabase.rpc('random_quotes_full')
    if (error) throw error
    const rows = data as any[]
    if (rows.length === 0) break
    for (const row of rows) {
      quotesById.set(row.id, randomQuoteRowToQuote(row))
    }
  }
  const quotes = [...quotesById.values()]
  await localdb.cacheQuotes(quotes)
  window.umami?.track('download_data_pack', { count: quotes.length })
  return quotes.length
}

/** YYYY-MM-DD for `daysAhead` days after today, in local time. */
function dateDaysAhead(daysAhead: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toLocaleDateString('en-CA')
}

/**
 * Today's quote_of_the_day plus up to `days - 1` upcoming days, as
 * (date, quote) pairs — for scheduling the daily notification rolling
 * window (see src/lib/notifications.ts)
 */
export async function fetchUpcomingQuoteOfDay(
  days: number,
): Promise<{ date: string; quote: QQuote }[]> {
  const dates = Array.from({ length: days }, (_, i) => dateDaysAhead(i))
  if (network.offline) {
    const cachedByDate = await localdb.getCachedQuoteOfDayRange(
      dates[0],
      dates[dates.length - 1],
    )
    return dates
      .filter((d) => cachedByDate.has(d))
      .map((date) => ({ date, quote: cachedByDate.get(date)! }))
  }

  const { data, error } = await supabase
    .from('quote_of_the_day')
    .select(`date, quote:quotes(${QUOTE_SELECT})`)
    .in('date', dates)
  if (error) throw error

  const presentRows = (
    data as unknown as { date: string; quote: any }[]
  ).filter((row) => row.quote)
  const hydrated = await hydrateQuoteRows(presentRows.map((row) => row.quote))

  const byDate = new Map<string, QQuote>()
  hydrated.forEach((quote, i) => {
    const date = presentRows[i].date
    byDate.set(date, quote)
    localdb.cacheQuoteOfDay(date, quote)
  })
  const quotes = [...byDate.values()]
  if (quotes.length > 0) localdb.cacheQuotes(quotes)

  return dates
    .filter((d) => byDate.has(d))
    .map((date) => ({ date, quote: byDate.get(date)! }))
}
