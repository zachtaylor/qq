import { supabase } from '$lib/supabase'
import { auth, ensureDeviceId } from '$lib/stores/session.svelte'
import { network } from '$lib/stores/network.svelte'
import { userContentCache } from '$lib/stores/userContentCache.svelte'
import * as localdb from '$lib/localdb'
import type { CardStyle } from '$lib/shareCard'
import type { Download, Quote, Tag } from '$lib/types'

const QUOTE_SELECT =
  'id, text, author_id, created_at, like_count, downloads_count, author:authors(name, slug), likes(device_id, user_id), quote_tags(tag:tags(id, name, slug))'

function toQuote(row: any): Quote {
  const likes: { device_id: string | null; user_id: string | null }[] =
    row.likes ?? []
  const quoteTags: { tag: Tag }[] = row.quote_tags ?? []
  return {
    id: row.id,
    text: row.text,
    author_id: row.author_id,
    created_at: row.created_at,
    author: row.author,
    tags: quoteTags.map((qt) => qt.tag),
    like_count: row.like_count,
    liked_by_me: likes.some(
      (l) =>
        (auth.userId && l.user_id === auth.userId) ||
        (!auth.userId && l.device_id === auth.deviceId),
    ),
    downloads_count: row.downloads_count,
  }
}

/** The persisted random-feed roll from local SQLite, with no network trip — meant to be used like a page load function so a fresh mount can render instantly instead of showing a spinner. */
export async function getCachedRandomFeed(limit = 50): Promise<Quote[]> {
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
): Promise<Quote[]> {
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
  })
  if (error) throw error
  const ids = (data as { id: string }[]).map((r) => r.id)
  if (ids.length === 0) return []
  const { data: rows, error: err2 } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .in('id', ids)
  if (err2) throw err2
  const order = new Map(ids.map((id, i) => [id, i]))
  const quotes = rows.map(toQuote)
  quotes.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  localdb.cacheRandomFeed(quotes)
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
): Promise<Quote[]> {
  const dates = quoteOfDayDates(days)
  const quotes: Quote[] = []
  for (const date of dates) {
    const cached = await localdb.getCachedQuoteOfDay(date)
    if (cached) quotes.push(cached)
  }
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
): Promise<Quote[]> {
  const dates = quoteOfDayDates(days)

  const cachedByDate = new Map<string, Quote>()
  const needed: string[] = []
  for (const date of dates) {
    const cached = await localdb.getCachedQuoteOfDay(date)
    if (cached) cachedByDate.set(date, cached)
    else needed.push(date)
  }

  if (needed.length === 0 || network.offline) {
    return dates
      .map((d) => cachedByDate.get(d))
      .filter((q): q is Quote => q != null)
  }

  const { data: rangeRows, error } = await supabase
    .from('quote_of_the_day')
    .select(`date, quote:quotes(${QUOTE_SELECT})`)
    .in('date', needed)
  if (error) throw error

  const freshQuotes: Quote[] = []
  for (const row of rangeRows as unknown as { date: string; quote: any }[]) {
    if (!row.quote) continue
    const quote = toQuote(row.quote)
    cachedByDate.set(row.date, quote)
    freshQuotes.push(quote)
    localdb.cacheQuoteOfDay(row.date, quote)
  }
  if (freshQuotes.length > 0) localdb.cacheQuotes(freshQuotes)

  return dates
    .map((d) => cachedByDate.get(d))
    .filter((q): q is Quote => q != null)
}

/** Row shape returned by the trending_quotes() RPC — full quote content in
 *  one round trip (see supabase/migrations/0013_trending_quotes_with_content.sql),
 *  so no follow-up `quotes` select (and no expensive per-row likes array)
 *  is needed just to render the list. Sort order still comes from the
 *  windowed recent_like_count/recent_download_count; cards themselves
 *  display the lifetime like_count/downloads_count columns. */
function trendingRowToQuote(row: any): Quote {
  return {
    id: row.id,
    text: row.text,
    author_id: row.author_id,
    created_at: row.created_at,
    author: { name: row.author_name, slug: row.author_slug },
    tags: row.tags ?? [],
    like_count: row.like_count,
    liked_by_me: row.liked_by_me,
    downloads_count: row.downloads_count,
  }
}

export async function fetchTrending(limit = 25): Promise<Quote[]> {
  if (network.offline) return localdb.getCachedTrending(limit)
  const { data, error } = await supabase.rpc('trending_quotes', {
    max_rows: limit,
    p_device_id: auth.userId ? null : auth.deviceId,
  })
  if (error) throw error
  const quotes = (data as any[]).map(trendingRowToQuote)
  localdb.cacheQuotes(quotes)
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
): Promise<Quote[]> {
  if (network.offline) return localdb.getCachedQuotesByAuthor(authorId)
  if (!force) {
    const age = await localdb.getAuthorQuotesAge(authorId)
    if (age !== null && age < AUTHOR_QUOTES_STALE_MS) {
      const cached = await localdb.getCachedQuotesByAuthor(authorId)
      if (cached.length > 0) return cached
    }
  }
  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .eq('author_id', authorId)
  if (error) throw error
  const quotes = data.map(toQuote)
  quotes.sort(
    (a, b) =>
      b.like_count + b.downloads_count - (a.like_count + a.downloads_count),
  )
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
}

export async function fetchDownloadHistory(): Promise<Download[]> {
  const userId = auth.userId
  const deviceId = auth.deviceId
  if (!userId && !deviceId) return []
  const identityFilter = userId ? { user_id: userId } : { device_id: deviceId }
  const { data, error } = await supabase
    .from('downloads')
    .select(
      'quote_id, style, created_at, quote:quotes(id, text, author:authors(name, slug))',
    )
    .match(identityFilter)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  const downloads = (data as any[])
    .filter((row) => row.quote)
    .map((row) => ({
      quoteId: row.quote_id,
      quote: row.quote,
      style: row.style,
      createdAt: row.created_at,
    }))
  localdb.cacheDownloadHistory(downloads)
  return downloads
}

/** Resolves a quote from SQLite first, then reconciles from the network when needed. */
export async function fetchQuoteById(quoteId: string): Promise<Quote | null> {
  const cached = await localdb.getCachedQuote(quoteId)
  if (cached || network.offline) return cached

  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .eq('id', quoteId)
    .maybeSingle()
  if (error) throw error
  const quote = data ? toQuote(data) : null
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
}

export async function fetchQuotesByTag(tagSlug: string): Promise<Quote[]> {
  if (network.offline) return localdb.getCachedQuotesByTag(tagSlug)
  const { data: tag, error: tagErr } = await supabase
    .from('tags')
    .select('id')
    .eq('slug', tagSlug)
    .maybeSingle()
  if (tagErr) throw tagErr
  if (!tag) return []
  const taggedSelect = QUOTE_SELECT.replace(
    'quote_tags(tag:tags',
    'quote_tags!inner(tag:tags',
  )
  const { data, error } = await supabase
    .from('quotes')
    .select(taggedSelect)
    .eq('quote_tags.tag_id', tag.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  const quotes = data.map(toQuote)
  localdb.cacheQuotes(quotes)
  return quotes
}

export async function fetchLikedQuotes(): Promise<Quote[]> {
  const userId = auth.userId
  const deviceId = auth.deviceId
  if (!userId && !deviceId) return []
  const identityFilter = userId ? { user_id: userId } : { device_id: deviceId }
  const { data: likeRows, error: likeErr } = await supabase
    .from('likes')
    .select('quote_id, created_at')
    .match(identityFilter)
    .order('created_at', { ascending: false })
  if (likeErr) throw likeErr
  if (likeRows.length === 0) return []
  const order = new Map(likeRows.map((r, i) => [r.quote_id, i]))
  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .in(
      'id',
      likeRows.map((r) => r.quote_id),
    )
  if (error) throw error
  const quotes = data.map(toQuote)
  quotes.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  localdb.cacheQuotes(quotes)
  return quotes
}

/**
 * Local-first: same-author quotes already sitting in SQLite (from any
 * prior fetch — author page, feeds, etc.) are returned immediately with
 * no network trip. Only when the cache doesn't have enough of them does
 * this fall back to a network query — and it skips tag-based matching
 * when offline, since that path has no local equivalent.
 */
export async function fetchSimilarQuotes(
  quote: Pick<Quote, 'id' | 'author_id' | 'tags'>,
  limit = 10,
): Promise<Quote[]> {
  // console.debug('fetchSimilarQuotes', quote)
  const cached = (
    await localdb.getCachedQuotesByAuthor(quote.author_id)
  ).filter((q) => q.id !== quote.id)
  if (cached.length >= limit || network.offline) return cached.slice(0, limit)

  const tagIds = quote.tags.map((t) => t.id)
  if (tagIds.length > 0) {
    const taggedSelect = QUOTE_SELECT.replace(
      'quote_tags(tag:tags',
      'quote_tags!inner(tag:tags',
    )
    const { data, error } = await supabase
      .from('quotes')
      .select(taggedSelect)
      .in('quote_tags.tag_id', tagIds)
      .neq('id', quote.id)
      .limit(limit)
    if (error) throw error
    const seen = new Map<string, Quote>()
    for (const row of data.map(toQuote)) seen.set(row.id, row)
    if (seen.size > 0) {
      const quotes = [...seen.values()]
      localdb.cacheQuotes(quotes)
      return quotes
    }
  }
  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .eq('author_id', quote.author_id)
    .neq('id', quote.id)
    .limit(limit)
  if (error) throw error
  const quotes = data.map(toQuote)
  localdb.cacheQuotes(quotes)
  return quotes
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
