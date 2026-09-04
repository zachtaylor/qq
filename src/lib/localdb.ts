import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import type { Author, Download, LikedQuote, Quote, Tag } from '$lib/types'
import type { CardStyle } from '$lib/shareCard'

const DB_NAME = 'qq'
const isNative = Capacitor.isNativePlatform()

let sqlite: SQLiteConnection
let db: SQLiteDBConnection
let readyPromise: Promise<boolean> | null = null
let transactionQueue: Promise<unknown> = Promise.resolve()
let saveTimeout: ReturnType<typeof setTimeout> | undefined

/**
 * Each entry migrates the local cache from index N to N+1. Append new
 * migrations to the end as the schema evolves — never edit an already-
 * shipped entry, since devices may already be sitting at that version.
 */
const MIGRATIONS: string[][] = [
  // 0 -> 1: initial schema
  [
    `CREATE TABLE IF NOT EXISTS authors (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT NOT NULL,
			bio TEXT,
			portrait_url TEXT,
			born_year INTEGER,
			died_year INTEGER
		)`,
    `CREATE TABLE IF NOT EXISTS quotes (
			id TEXT PRIMARY KEY,
			text TEXT NOT NULL,
			author_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			like_count INTEGER NOT NULL DEFAULT 0,
			liked_by_me INTEGER NOT NULL DEFAULT 0,
			downloads_count INTEGER NOT NULL DEFAULT 0
		)`,
    `CREATE TABLE IF NOT EXISTS tags (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT NOT NULL
		)`,
    `CREATE TABLE IF NOT EXISTS quote_tags (
			quote_id TEXT NOT NULL,
			tag_id TEXT NOT NULL,
			PRIMARY KEY (quote_id, tag_id)
		)`,
  ],
  // 1 -> 2: local download history, for instant settings-tab rendering
  [
    `CREATE TABLE IF NOT EXISTS downloads (
			quote_id TEXT NOT NULL,
			style TEXT,
			created_at TEXT NOT NULL,
			PRIMARY KEY (quote_id, created_at)
		)`,
  ],
  // 2 -> 3: per-date quote-of-the-day pairing. The (date -> quote_id) pairing
  // never changes once assigned, so past dates can be served from here
  // forever without a network round-trip.
  [
    `CREATE TABLE IF NOT EXISTS quote_of_day (
			date TEXT PRIMARY KEY,
			quote_id TEXT NOT NULL
		)`,
  ],
  // 3 -> 4: persisted copy of the current random-feed roll, so it survives
  // app restarts (not just in-memory feedCache) and a pull-to-refresh can
  // be expressed as "wipe and reinsert" rather than merging in place.
  [
    `CREATE TABLE IF NOT EXISTS random_feed (
			position INTEGER PRIMARY KEY,
			quote_id TEXT NOT NULL
		)`,
  ],
  // 4 -> 5: local like history, so the settings tab can show when each
  // quote was liked without a network round-trip.
  [
    `CREATE TABLE IF NOT EXISTS liked_quotes (
			quote_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (quote_id, created_at)
		)`,
  ],
]

async function migrate(): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  )
  const result = await db.query(
    `SELECT value FROM _meta WHERE key = 'schema_version'`,
  )
  let version = result.values?.[0]?.value ? Number(result.values[0].value) : 0

  while (version < MIGRATIONS.length) {
    const statements = MIGRATIONS[version]
    for (const stmt of statements) {
      await db.execute(stmt + ';')
    }
    version += 1
    await db.run(
      `INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)`,
      [String(version)],
    )
  }
}

async function run(query: string, params: unknown[] = []) {
  if (isNative) return db.run(query, params)
  return new Promise((resolve, reject) => {
    transactionQueue = transactionQueue.then(async () => {
      try {
        resolve(await db.run(query, params))
        scheduleSave()
      } catch (err) {
        reject(err)
      }
    })
  })
}

async function query(sql: string, params: unknown[] = []) {
  const result = await db.query(sql, params)
  return result.values ?? []
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => sqlite.saveToStore(DB_NAME), 500)
}

async function init(): Promise<boolean> {
  try {
    sqlite = new SQLiteConnection(CapacitorSQLite)
    if (!isNative) {
      await customElements.whenDefined('jeep-sqlite')
      if (!document.querySelector('jeep-sqlite')) {
        document.body.appendChild(document.createElement('jeep-sqlite'))
      }
      await sqlite.initWebStore()
    }
    db = await sqlite.createConnection(
      DB_NAME,
      false,
      'no-encryption',
      1,
      false,
    )
    await db.open()
    await migrate()
    return true
  } catch (err) {
    console.error('localdb: init failed', err)
    return false
  }
}

export function ready(): Promise<boolean> {
  if (!readyPromise) readyPromise = init()
  return readyPromise
}

function toQuote(
  row: any,
  tagsByQuote: Map<string, Tag[]>,
  authorsById: Map<string, Author>,
): Quote {
  const author = authorsById.get(row.author_id)
  return {
    id: row.id,
    text: row.text,
    author_id: row.author_id,
    created_at: row.created_at,
    author: author
      ? { name: author.name, slug: author.slug }
      : { name: 'Unknown', slug: '' },
    tags: tagsByQuote.get(row.id) ?? [],
    like_count: row.like_count,
    liked_by_me: !!row.liked_by_me,
    downloads_count: row.downloads_count,
  }
}

/** Upserts quotes (and their authors/tags) into the local cache after a successful online fetch. */
export async function cacheQuotes(quotes: Quote[]): Promise<void> {
  if (!(await ready())) return
  try {
    for (const quote of quotes) {
      await run(
        `INSERT OR REPLACE INTO authors (id, name, slug, bio, portrait_url, born_year, died_year)
				 VALUES (?, ?, ?, COALESCE((SELECT bio FROM authors WHERE id = ?), NULL),
				         COALESCE((SELECT portrait_url FROM authors WHERE id = ?), NULL),
				         COALESCE((SELECT born_year FROM authors WHERE id = ?), NULL),
				         COALESCE((SELECT died_year FROM authors WHERE id = ?), NULL))`,
        [
          quote.author_id,
          quote.author.name,
          quote.author.slug,
          quote.author_id,
          quote.author_id,
          quote.author_id,
          quote.author_id,
        ],
      )
      await run(
        `INSERT OR REPLACE INTO quotes (id, text, author_id, created_at, like_count, liked_by_me, downloads_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          quote.id,
          quote.text,
          quote.author_id,
          quote.created_at,
          quote.like_count,
          quote.liked_by_me ? 1 : 0,
          quote.downloads_count,
        ],
      )
      await run(`DELETE FROM quote_tags WHERE quote_id = ?`, [quote.id])
      for (const tag of quote.tags) {
        await run(
          `INSERT OR REPLACE INTO tags (id, name, slug) VALUES (?, ?, ?)`,
          [tag.id, tag.name, tag.slug],
        )
        await run(
          `INSERT OR REPLACE INTO quote_tags (quote_id, tag_id) VALUES (?, ?)`,
          [quote.id, tag.id],
        )
      }
    }
  } catch (err) {
    console.error('localdb: cacheQuotes failed', err)
  }
}

/** Caches full author profile details (bio, portrait, years) once fetched online. */
export async function cacheAuthor(author: Author): Promise<void> {
  if (!(await ready())) return
  try {
    await run(
      `INSERT OR REPLACE INTO authors (id, name, slug, bio, portrait_url, born_year, died_year) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        author.id,
        author.name,
        author.slug,
        author.bio,
        author.portrait_url,
        author.born_year,
        author.died_year,
      ],
    )
  } catch (err) {
    console.error('localdb: cacheAuthor failed', err)
  }
}

function authorFetchedAtKey(slug: string): string {
  return `author_fetched_at:${slug}`
}

/** Stamps the fetch time for an author profile in _meta, so a later visit can skip the network refetch if still fresh (see getAuthorAge). */
export async function markAuthorFetched(slug: string): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`, [
      authorFetchedAtKey(slug),
      String(Date.now()),
    ])
  } catch (err) {
    console.error('localdb: markAuthorFetched failed', err)
  }
}

/** Milliseconds since an author profile was last fetched from the network, or null if never. */
export async function getAuthorAge(slug: string): Promise<number | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT value FROM _meta WHERE key = ?`, [
    authorFetchedAtKey(slug),
  ])) as any[]
  if (rows.length === 0) return null
  return Date.now() - Number(rows[0].value)
}

async function loadTagsAndAuthors(quoteIds: string[]): Promise<{
  tagsByQuote: Map<string, Tag[]>
  authorsById: Map<string, Author>
}> {
  const tagsByQuote = new Map<string, Tag[]>()
  const authorsById = new Map<string, Author>()
  if (quoteIds.length === 0) return { tagsByQuote, authorsById }

  const placeholders = quoteIds.map(() => '?').join(', ')
  const qtRows = await query(
    `SELECT quote_tags.quote_id as quote_id, tags.id as id, tags.name as name, tags.slug as slug
		 FROM quote_tags JOIN tags ON tags.id = quote_tags.tag_id
		 WHERE quote_tags.quote_id IN (${placeholders})`,
    quoteIds,
  )
  for (const row of qtRows as any[]) {
    const list = tagsByQuote.get(row.quote_id) ?? []
    list.push({ id: row.id, name: row.name, slug: row.slug })
    tagsByQuote.set(row.quote_id, list)
  }

  const authorRows = await query(
    `SELECT DISTINCT authors.* FROM authors JOIN quotes ON quotes.author_id = authors.id WHERE quotes.id IN (${placeholders})`,
    quoteIds,
  )
  for (const row of authorRows as any[]) authorsById.set(row.id, row as Author)

  return { tagsByQuote, authorsById }
}

export async function getCachedFeed(limit = 50): Promise<Quote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT * FROM quotes ORDER BY created_at DESC LIMIT ?`,
    [limit],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors(
    rows.map((r) => r.id),
  )
  return rows.map((r) => toQuote(r, tagsByQuote, authorsById))
}

const RANDOM_FEED_FETCHED_AT_KEY = 'random_feed_fetched_at'

/** Replaces the persisted random-feed roll with a fresh one: wipe then reinsert, preserving order. Also stamps the fetch time in _meta, so it survives app restarts (unlike the in-memory feedCache). */
export async function cacheRandomFeed(quotes: Quote[]): Promise<void> {
  if (!(await ready())) return
  try {
    await cacheQuotes(quotes)
    await run(`DELETE FROM random_feed`)
    for (let i = 0; i < quotes.length; i++) {
      await run(
        `INSERT OR REPLACE INTO random_feed (position, quote_id) VALUES (?, ?)`,
        [i, quotes[i].id],
      )
    }
    await run(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`, [
      RANDOM_FEED_FETCHED_AT_KEY,
      String(Date.now()),
    ])
  } catch (err) {
    console.error('localdb: cacheRandomFeed failed', err)
  }
}

/** Milliseconds since the persisted random feed was last (re)fetched, or null if it's never been cached. */
export async function getRandomFeedAge(): Promise<number | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT value FROM _meta WHERE key = ?`, [
    RANDOM_FEED_FETCHED_AT_KEY,
  ])) as any[]
  if (rows.length === 0) return null
  return Date.now() - Number(rows[0].value)
}

/** Reads the persisted random-feed roll set by cacheRandomFeed(), in its saved order. */
export async function getCachedRandomFeed(limit = 50): Promise<Quote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT quotes.* FROM random_feed
		 JOIN quotes ON quotes.id = random_feed.quote_id
		 ORDER BY random_feed.position LIMIT ?`,
    [limit],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors(
    rows.map((r) => r.id),
  )
  return rows.map((r) => toQuote(r, tagsByQuote, authorsById))
}

export async function getCachedTrending(limit = 25): Promise<Quote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT * FROM quotes ORDER BY (like_count * 3 + downloads_count) DESC LIMIT ?`,
    [limit],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors(
    rows.map((r) => r.id),
  )
  return rows.map((r) => toQuote(r, tagsByQuote, authorsById))
}

function authorQuotesFetchedAtKey(authorId: string): string {
  return `author_quotes_fetched_at:${authorId}`
}

/** Stamps the fetch time for an author's quote list in _meta, so a later visit can skip the network refetch if still fresh (see getAuthorQuotesAge). */
export async function markAuthorQuotesFetched(authorId: string): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`, [
      authorQuotesFetchedAtKey(authorId),
      String(Date.now()),
    ])
  } catch (err) {
    console.error('localdb: markAuthorQuotesFetched failed', err)
  }
}

/** Milliseconds since an author's quote list was last fetched from the network, or null if never. */
export async function getAuthorQuotesAge(
  authorId: string,
): Promise<number | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT value FROM _meta WHERE key = ?`, [
    authorQuotesFetchedAtKey(authorId),
  ])) as any[]
  if (rows.length === 0) return null
  return Date.now() - Number(rows[0].value)
}

export async function getCachedQuotesByAuthor(
  authorId: string,
): Promise<Quote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT * FROM quotes WHERE author_id = ? ORDER BY created_at DESC`,
    [authorId],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors(
    rows.map((r) => r.id),
  )
  return rows.map((r) => toQuote(r, tagsByQuote, authorsById))
}

export async function getCachedQuotesByTag(tagSlug: string): Promise<Quote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT quotes.* FROM quotes
		 JOIN quote_tags ON quote_tags.quote_id = quotes.id
		 JOIN tags ON tags.id = quote_tags.tag_id
		 WHERE tags.slug = ? ORDER BY quotes.created_at DESC`,
    [tagSlug],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors(
    rows.map((r) => r.id),
  )
  return rows.map((r) => toQuote(r, tagsByQuote, authorsById))
}

/** Optimistically reflects a successful record_download() call in the local cache. */
export async function bumpDownloadsCount(quoteId: string): Promise<void> {
  if (!(await ready())) return
  try {
    await run(
      `UPDATE quotes SET downloads_count = downloads_count + 1 WHERE id = ?`,
      [quoteId],
    )
  } catch (err) {
    console.error('localdb: bumpDownloadsCount failed', err)
  }
}

export async function getCachedLikedQuotes(): Promise<LikedQuote[]> {
  if (!(await ready())) return []
  const likeRows = (await query(
    `SELECT quote_id, created_at FROM liked_quotes ORDER BY created_at DESC`,
  )) as any[]
  if (likeRows.length === 0) return []
  const quoteIds = likeRows.map((r) => r.quote_id)
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors(quoteIds)
  const quoteRows = (await query(
    `SELECT * FROM quotes WHERE id IN (${quoteIds.map(() => '?').join(', ')})`,
    quoteIds,
  )) as any[]
  const quotesById = new Map(
    quoteRows.map((r) => [r.id, toQuote(r, tagsByQuote, authorsById)]),
  )
  const result: LikedQuote[] = []
  for (const row of likeRows) {
    const quote = quotesById.get(row.quote_id)
    if (!quote) continue
    result.push({ quote, likedAt: row.created_at })
  }
  return result
}

/** Replaces the local like-history cache with a freshly fetched one from the server. */
export async function cacheLikedQuotes(likes: LikedQuote[]): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`DELETE FROM liked_quotes`)
    for (const l of likes) {
      await run(
        `INSERT OR REPLACE INTO liked_quotes (quote_id, created_at) VALUES (?, ?)`,
        [l.quote.id, l.likedAt],
      )
    }
  } catch (err) {
    console.error('localdb: cacheLikedQuotes failed', err)
  }
}

/** Reflects a like/unlike made through setLiked() in the local cache immediately, ahead of the network round-trip. */
export async function setCachedLiked(
  quoteId: string,
  liked: boolean,
): Promise<void> {
  if (!(await ready())) return
  try {
    await run(
      `UPDATE quotes SET liked_by_me = ?, like_count = like_count + ? WHERE id = ?`,
      [liked ? 1 : 0, liked ? 1 : -1, quoteId],
    )
    if (liked) {
      await run(
        `INSERT OR REPLACE INTO liked_quotes (quote_id, created_at) VALUES (?, ?)`,
        [quoteId, new Date().toISOString()],
      )
    } else {
      await run(`DELETE FROM liked_quotes WHERE quote_id = ?`, [quoteId])
    }
  } catch (err) {
    console.error('localdb: setCachedLiked failed', err)
  }
}

/** Records a download locally right after a successful recordDownload() call. */
export async function recordLocalDownload(
  quoteId: string,
  style: CardStyle | null,
): Promise<void> {
  if (!(await ready())) return
  try {
    await run(
      `INSERT OR REPLACE INTO downloads (quote_id, style, created_at) VALUES (?, ?, ?)`,
      [quoteId, style ? JSON.stringify(style) : null, new Date().toISOString()],
    )
  } catch (err) {
    console.error('localdb: recordLocalDownload failed', err)
  }
}

/** Replaces the local download-history cache with a freshly fetched one from the server. */
export async function cacheDownloadHistory(
  downloads: Download[],
): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`DELETE FROM downloads`)
    for (const d of downloads) {
      await run(
        `INSERT OR REPLACE INTO downloads (quote_id, style, created_at) VALUES (?, ?, ?)`,
        [d.quoteId, d.style ? JSON.stringify(d.style) : null, d.createdAt],
      )
    }
  } catch (err) {
    console.error('localdb: cacheDownloadHistory failed', err)
  }
}

export async function getCachedDownloadHistory(
  limit = 200,
): Promise<Download[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT * FROM downloads ORDER BY created_at DESC LIMIT ?`,
    [limit],
  )) as any[]
  const quoteIds = rows.map((r) => r.quote_id)
  const { authorsById } = await loadTagsAndAuthors(quoteIds)
  const quoteRows =
    quoteIds.length === 0
      ? []
      : ((await query(
          `SELECT * FROM quotes WHERE id IN (${quoteIds.map(() => '?').join(', ')})`,
          quoteIds,
        )) as any[])
  const quotesById = new Map(quoteRows.map((r) => [r.id, r]))
  const result: Download[] = []
  for (const row of rows) {
    const quoteRow = quotesById.get(row.quote_id)
    if (!quoteRow) continue
    const author = authorsById.get(quoteRow.author_id)
    result.push({
      quoteId: row.quote_id,
      quote: {
        id: quoteRow.id,
        text: quoteRow.text,
        author: author
          ? { name: author.name, slug: author.slug }
          : { name: 'Unknown', slug: '' },
      },
      style: row.style ? JSON.parse(row.style) : null,
      createdAt: row.created_at,
    })
  }
  return result
}

/** Remembers a date's quote-of-the-day pick. The (date -> quote) pairing is immutable once assigned. */
export async function cacheQuoteOfDay(
  date: string,
  quote: Quote,
): Promise<void> {
  if (!(await ready())) return
  try {
    await run(
      `INSERT OR REPLACE INTO quote_of_day (date, quote_id) VALUES (?, ?)`,
      [date, quote.id],
    )
  } catch (err) {
    console.error('localdb: cacheQuoteOfDay failed', err)
  }
}

export async function getCachedQuoteOfDay(date: string): Promise<Quote | null> {
  if (!(await ready())) return null
  const rows = (await query(
    `SELECT quote_id FROM quote_of_day WHERE date = ?`,
    [date],
  )) as any[]
  if (rows.length === 0) return null
  const id = rows[0].quote_id
  const quoteRows = (await query(`SELECT * FROM quotes WHERE id = ?`, [
    id,
  ])) as any[]
  if (quoteRows.length === 0) return null
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors([id])
  return toQuote(quoteRows[0], tagsByQuote, authorsById)
}

export async function getCachedQuote(id: string): Promise<Quote | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT * FROM quotes WHERE id = ?`, [id])) as any[]
  if (rows.length === 0) return null
  const { tagsByQuote, authorsById } = await loadTagsAndAuthors([id])
  return toQuote(rows[0], tagsByQuote, authorsById)
}

export async function getCachedAuthorBySlug(
  slug: string,
): Promise<Author | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT * FROM authors WHERE slug = ? LIMIT 1`, [
    slug,
  ])) as any[]
  return (rows[0] as Author) ?? null
}
