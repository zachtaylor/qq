import { supabase } from '$lib/supabase'
import { auth, ensureDeviceId } from '$lib/stores/session.svelte'
import { network } from '$lib/stores/network.svelte'
import * as localdb from '$lib/localdb'
import type { Author, Download, LikedQuote, QQuote, Tag } from '$lib/types'

export const USER_CONTENT_STALE_MS = 30 * 60 * 1000

export async function fetchUserContentBundle(force = false): Promise<{
  likes: LikedQuote[]
  downloads: Download[]
}> {
  const userId = auth.userId
  const deviceId = userId ? null : await ensureDeviceId()
  if (!userId && !deviceId) {
    console.debug('[content]', performance.now(), 'no id')
    return { likes: [], downloads: [] }
  }
  const identityKey = userId ? `user:${userId}` : `device:${deviceId}`
  console.debug('[content]', performance.now(), 'id', identityKey)

  if (network.offline) {
    console.debug('[content]', performance.now(), 'offline')
    return {
      likes: await localdb.getCachedLikedQuotes(),
      downloads: await localdb.getCachedDownloadHistory(),
    }
  }

  if (!force) {
    const age = await localdb.getUserContentAge(identityKey)
    if (age !== null && age < USER_CONTENT_STALE_MS) {
      console.debug('[content]', performance.now(), 'cache', {
        identityKey,
        age,
      })
      return {
        likes: await localdb.getCachedLikedQuotes(),
        downloads: await localdb.getCachedDownloadHistory(),
      }
    }
  }

  const identityFilter = userId ? { user_id: userId } : { device_id: deviceId }

  const [
    { data: likeRows, error: likeErr },
    { data: downloadRows, error: downloadErr },
  ] = await Promise.all([
    supabase
      .from('likes')
      .select('quote_id, created_at, quote:quotes(*)')
      .match(identityFilter)
      .order('created_at', { ascending: false }),
    supabase
      .from('downloads')
      .select('quote_id, style, created_at, quote:quotes(*)')
      .match(identityFilter)
      .order('created_at', { ascending: false }),
  ])
  if (likeErr) throw likeErr
  if (downloadErr) throw downloadErr
  console.debug('[content]', performance.now(), 'fetched', {
    likeRows,
    downloadRows,
  })

  type QuoteRow = {
    id: string
    text: string
    author_id: string
    created_at: string
    like_count: number
    downloads_count: number
  }
  const likeQuoteRows = likeRows as unknown as {
    quote_id: string
    created_at: string
    quote: QuoteRow | null
  }[]
  const downloadQuoteRows = downloadRows as unknown as {
    quote_id: string
    style: any
    created_at: string
    quote: QuoteRow | null
  }[]

  const quoteRowsById = new Map<string, QuoteRow>()
  for (const row of likeQuoteRows)
    if (row.quote) quoteRowsById.set(row.quote_id, row.quote)
  for (const row of downloadQuoteRows)
    if (row.quote) quoteRowsById.set(row.quote_id, row.quote)
  const quoteIds = [...quoteRowsById.keys()]
  if (quoteIds.length === 0) {
    console.debug('[content]', performance.now(), 'stop')
    localdb.markUserContentFetched(identityKey)
    return { likes: [], downloads: [] }
  }

  const authorIds = [
    ...new Set([...quoteRowsById.values()].map((r) => r.author_id)),
  ]

  const [
    { data: quoteTagRows, error: tagErr },
    { data: authorRows, error: authorErr },
  ] = await Promise.all([
    supabase
      .from('quote_tags')
      .select('quote_id, tag:tags(id, name, slug)')
      .in('quote_id', quoteIds),
    supabase
      .from('authors')
      .select('id, name, slug, portrait_url')
      .in('id', authorIds),
  ])
  if (tagErr) throw tagErr
  if (authorErr) throw authorErr
  console.debug('[content]', performance.now(), 'done', {
    authorRows,
    quoteTagRows,
  })

  const authorsById = new Map<string, Author>()
  for (const a of authorRows as {
    id: string
    name: string
    slug: string
    portrait_url: string | null
  }[]) {
    authorsById.set(a.id, {
      ...a,
      bio: null,
      born_year: null,
      died_year: null,
    })
  }

  const tagsByQuote = new Map<string, Tag[]>()
  for (const row of quoteTagRows as unknown as {
    quote_id: string
    tag: Tag
  }[]) {
    const list = tagsByQuote.get(row.quote_id) ?? []
    list.push(row.tag)
    tagsByQuote.set(row.quote_id, list)
  }

  const likeSet = new Set(likeQuoteRows.map((r) => r.quote_id))
  const quotesById = new Map<string, QQuote>()
  for (const [id, row] of quoteRowsById) {
    quotesById.set(id, {
      id: row.id,
      text: row.text,
      author_id: row.author_id,
      author: authorsById.get(row.author_id)!,
      created_at: row.created_at,
      tags: tagsByQuote.get(id) ?? [],
      like_count: row.like_count,
      liked_by_me: likeSet.has(id),
      downloads_count: row.downloads_count,
    })
  }

  const likes: LikedQuote[] = likeQuoteRows
    .map((r) => {
      const quote = quotesById.get(r.quote_id)
      return quote ? { quote, likedAt: r.created_at } : null
    })
    .filter((l): l is LikedQuote => l != null)

  const downloads: Download[] = downloadQuoteRows
    .map((r) => {
      const quote = quotesById.get(r.quote_id)
      return quote
        ? {
            quoteId: r.quote_id,
            quote: {
              id: quote.id,
              text: quote.text,
              author_id: quote.author_id,
              author: quote.author,
            },
            style: r.style,
            createdAt: r.created_at,
          }
        : null
    })
    .filter((d): d is Download => d != null)

  const quotes = [...quotesById.values()]
  await Promise.all([
    localdb.cacheQuotes(quotes),
    localdb.cacheLikedQuotes(likes),
    localdb.cacheDownloadHistory(downloads),
    localdb.markUserContentFetched(identityKey),
  ])
  console.debug('[content]', performance.now(), 'cached bundle', {
    identityKey,
    likeCount: likes.length,
    downloadCount: downloads.length,
  })

  return { likes, downloads }
}
