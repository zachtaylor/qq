import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import type {
  Author,
  Download,
  LikedQuote,
  QQuote,
  Quote,
  Tag,
} from '$lib/types'
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

  console.debug('[sqlite] current version:', version)
  if (version == MIGRATIONS.length) return

  while (version < MIGRATIONS.length) {
    console.debug('[sqlite] migration', version, '->', version + 1)
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
  console.debug('[sqlite] migrated version:', version)
}

async function run(query: string, params: unknown[] = []) {
  console.debug('[sqlite] run', query, params)
  if (isNative) return db.run(query, params)
  return new Promise((resolve, reject) => {
    transactionQueue = transactionQueue.then(async () => {
      try {
        resolve(await db.run(query, params))
        scheduleSave()
      } catch (err) {
        console.debug('[sqlite] run failed', query, err)
        reject(err)
      }
    })
  })
}

async function query(sql: string, params: unknown[] = []) {
  const result = await db.query(sql, params)
  console.debug('[sqlite] query', sql, params, result.values)
  return result.values ?? []
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    console.debug('[sqlite] saveToStore', DB_NAME)
    sqlite.saveToStore(DB_NAME)
  }, 500)
}

async function init(): Promise<boolean> {
  console.debug('[boot]', performance.now(), 'localdb init start')
  try {
    sqlite = new SQLiteConnection(CapacitorSQLite)
    if (!isNative) {
      await customElements.whenDefined('jeep-sqlite')
      console.debug('[boot]', performance.now(), 'localdb jeep-sqlite defined')
      if (!document.querySelector('jeep-sqlite')) {
        document.body.appendChild(document.createElement('jeep-sqlite'))
      }
      await sqlite.initWebStore()
      console.debug('[boot]', performance.now(), 'localdb initWebStore done')
    }
    db = await sqlite.createConnection(
      DB_NAME,
      false,
      'no-encryption',
      1,
      false,
    )
    await db.open()
    console.debug('[boot]', performance.now(), 'localdb opened')
    await migrate()
    console.debug('[boot]', performance.now(), 'localdb init done')
    return true
  } catch (err) {
    console.error('localdb: init failed', err)
    return false
  }
}

export function ready(): Promise<boolean> {
  if (!readyPromise) {
    readyPromise = init()
  }
  return readyPromise
}

/** Columns selected from `quotes` in every quote-with-author query below —
 *  aliased so they can share a result row with the joined `authors` columns
 *  without colliding on `id`. */
const QUOTE_WITH_AUTHOR_SELECT = `
	quotes.id AS id,
	quotes.text AS text,
	quotes.author_id AS author_id,
	quotes.created_at AS created_at,
	quotes.like_count AS like_count,
	quotes.liked_by_me AS liked_by_me,
	quotes.downloads_count AS downloads_count,
	authors.name AS author_name,
	authors.slug AS author_slug,
	authors.bio AS author_bio,
	authors.portrait_url AS author_portrait_url,
	authors.born_year AS author_born_year,
	authors.died_year AS author_died_year
`
const QUOTE_WITH_AUTHOR_JOIN = `quotes JOIN authors ON authors.id = quotes.author_id`

function toQuote(row: any): Quote {
  return {
    id: row.id,
    text: row.text,
    author_id: row.author_id,
    created_at: row.created_at,
    like_count: row.like_count,
    liked_by_me: !!row.liked_by_me,
    downloads_count: row.downloads_count,
  }
}

/** Builds a QQuote from a row produced by a QUOTE_WITH_AUTHOR_SELECT query —
 *  author fields come straight off the joined row, no second lookup. Tags
 *  are still batched separately via loadTags(), since quote_tags is a
 *  many-to-many join that doesn't collapse into a single row per quote. */
function toQQuote(
  row: any,
  tagsByQuote: Map<string, Tag[]>,
  authorsById?: Map<string, Author>,
): QQuote {
  const author = authorsById
    ? authorsById.get(row.author_id)
    : {
        id: row.author_id,
        name: row.author_name,
        slug: row.author_slug,
        bio: row.author_bio,
        portrait_url: row.author_portrait_url,
        born_year: row.author_born_year,
        died_year: row.author_died_year,
      }
  return {
    ...toQuote(row),
    author: author as Author,
    tags: tagsByQuote.get(row.id) ?? [],
  }
}

/** Batches the tag and author lookups needed to hydrate a set of bare
 *  `quotes.*` rows (no author join) into QQuotes — used by callers that
 *  can't use QUOTE_WITH_AUTHOR_JOIN because their base query already joins
 *  on something else (quote_tags, liked_quotes, quote_of_day). */
async function loadRelated(rows: any[]): Promise<{
  tagsByQuote: Map<string, Tag[]>
  authorsById: Map<string, Author>
}> {
  const [tagsByQuote, authorsById] = await Promise.all([
    loadTags(rows.map((r) => r.id)),
    getCachedAuthorsByIds([...new Set(rows.map((r) => r.author_id))]),
  ])
  return { tagsByQuote, authorsById }
}

/** Upserts quotes (and their authors/tags) into the local cache after a successful online fetch. */
export async function cacheQuotes(quotes: QQuote[]): Promise<void> {
  if (!(await ready())) return
  if (quotes.length === 0) return
  try {
    // Quote payloads only ever carry name/slug/portrait_url for their author
    // (see the `author:authors(...)` select in api/quotes.ts) — bio/born_year/
    // died_year come solely from cacheAuthor()'s full-profile fetch, so an
    // upsert here must leave those three columns alone rather than null them
    // out on every quote re-cache.
    const authorPlaceholders = quotes.map(() => '(?, ?, ?, ?)').join(', ')
    const authorParams = quotes.flatMap((quote) => {
      const author = quote.author
      return [quote.author_id, author.name, author.slug, author.portrait_url]
    })
    await run(
      `INSERT INTO authors (id, name, slug, portrait_url) VALUES ${authorPlaceholders}
			 ON CONFLICT (id) DO UPDATE SET
			   name = excluded.name, slug = excluded.slug, portrait_url = excluded.portrait_url`,
      authorParams,
    )

    const quotePlaceholders = quotes
      .map(() => '(?, ?, ?, ?, ?, ?, ?)')
      .join(', ')
    const quoteParams = quotes.flatMap((quote) => [
      quote.id,
      quote.text,
      quote.author_id,
      quote.created_at,
      quote.like_count,
      quote.liked_by_me ? 1 : 0,
      quote.downloads_count,
    ])
    await run(
      `INSERT OR REPLACE INTO quotes (id, text, author_id, created_at, like_count, liked_by_me, downloads_count) VALUES ${quotePlaceholders}`,
      quoteParams,
    )

    const quoteIdPlaceholders = quotes.map(() => '?').join(', ')
    await run(
      `DELETE FROM quote_tags WHERE quote_id IN (${quoteIdPlaceholders})`,
      quotes.map((quote) => quote.id),
    )

    const allTags = quotes.flatMap((quote) => quote.tags)
    if (allTags.length > 0) {
      const tagPlaceholders = allTags.map(() => '(?, ?, ?)').join(', ')
      const tagParams = allTags.flatMap((tag) => [tag.id, tag.name, tag.slug])
      await run(
        `INSERT OR REPLACE INTO tags (id, name, slug) VALUES ${tagPlaceholders}`,
        tagParams,
      )
    }

    const allQuoteTags = quotes.flatMap((quote) =>
      quote.tags.map((tag) => [quote.id, tag.id]),
    )
    if (allQuoteTags.length > 0) {
      const quoteTagPlaceholders = allQuoteTags.map(() => '(?, ?)').join(', ')
      const quoteTagParams = allQuoteTags.flat()
      await run(
        `INSERT OR REPLACE INTO quote_tags (quote_id, tag_id) VALUES ${quoteTagPlaceholders}`,
        quoteTagParams,
      )
    }
  } catch (err) {
    console.error('localdb: cacheQuotes failed', err)
  }
}

/** Looks up whichever of the given author ids are already cached locally — used to fetch only what's missing instead of re-embedding full author rows on every quote query. */
export async function getCachedAuthorsByIds(
  ids: string[],
): Promise<Map<string, Author>> {
  const byId = new Map<string, Author>()
  if (ids.length === 0 || !(await ready())) return byId
  const placeholders = ids.map(() => '?').join(', ')
  const rows = (await query(
    `SELECT * FROM authors WHERE id IN (${placeholders})`,
    ids,
  )) as any[]
  for (const row of rows) byId.set(row.id, row as Author)
  return byId
}

/** Looks up whichever of the given tag ids are already cached locally — tags are few enough that the full set is almost always already cached, so only genuinely new ones need a network fetch. */
export async function getCachedTagsByIds(
  ids: string[],
): Promise<Map<string, Tag>> {
  const byId = new Map<string, Tag>()
  if (ids.length === 0 || !(await ready())) return byId
  const placeholders = ids.map(() => '?').join(', ')
  const rows = (await query(
    `SELECT * FROM tags WHERE id IN (${placeholders})`,
    ids,
  )) as any[]
  for (const row of rows) byId.set(row.id, row as Tag)
  return byId
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

/** Loads the tag set for each of the given quote ids in one batched join. */
async function loadTags(quoteIds: string[]): Promise<Map<string, Tag[]>> {
  const tagsByQuote = new Map<string, Tag[]>()
  if (quoteIds.length === 0) return tagsByQuote

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

  return tagsByQuote
}

export async function getCachedFeed(limit = 50): Promise<QQuote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT ${QUOTE_WITH_AUTHOR_SELECT} FROM ${QUOTE_WITH_AUTHOR_JOIN}
		 ORDER BY quotes.created_at DESC LIMIT ?`,
    [limit],
  )) as any[]
  const tagsByQuote = await loadTags(rows.map((r) => r.id))
  return rows.map((r) => toQQuote(r, tagsByQuote))
}

/** Searches the local cache by quote text or author name — offline, since it's just whatever has already been synced to SQLite. */
export async function searchQuotes(
  term: string,
  limit = 50,
): Promise<QQuote[]> {
  if (!(await ready())) return []
  const trimmed = term.trim()
  if (trimmed.length === 0) return []
  const like = `%${trimmed}%`
  const rows = (await query(
    `SELECT ${QUOTE_WITH_AUTHOR_SELECT} FROM ${QUOTE_WITH_AUTHOR_JOIN}
		 WHERE quotes.text LIKE ? OR authors.name LIKE ?
		 ORDER BY quotes.created_at DESC LIMIT ?`,
    [like, like, limit],
  )) as any[]
  const tagsByQuote = await loadTags(rows.map((r) => r.id))
  return rows.map((r) => toQQuote(r, tagsByQuote))
}

const RANDOM_FEED_FETCHED_AT_KEY = 'random_feed_fetched_at'

/** Replaces the persisted random-feed roll with a fresh one: wipe then reinsert, preserving order. Also stamps the fetch time in _meta, so it survives app restarts (unlike the in-memory feedCache). */
export async function cacheRandomFeed(quotes: QQuote[]): Promise<void> {
  if (!(await ready())) return
  try {
    await cacheQuotes(quotes)
    await run(`DELETE FROM random_feed`)
    if (quotes.length > 0) {
      const placeholders = quotes.map(() => '(?, ?)').join(', ')
      const params = quotes.flatMap((q, i) => [i, q.id])
      await run(
        `INSERT OR REPLACE INTO random_feed (position, quote_id) VALUES ${placeholders}`,
        params,
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
export async function getCachedRandomFeed(limit = 50): Promise<QQuote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT ${QUOTE_WITH_AUTHOR_SELECT} FROM random_feed
		 JOIN quotes ON quotes.id = random_feed.quote_id
		 JOIN authors ON authors.id = quotes.author_id
		 ORDER BY random_feed.position LIMIT ?`,
    [limit],
  )) as any[]
  const tagsByQuote = await loadTags(rows.map((r) => r.id))
  return rows.map((r) => toQQuote(r, tagsByQuote))
}

export async function getCachedTrending(limit = 25): Promise<QQuote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT ${QUOTE_WITH_AUTHOR_SELECT} FROM ${QUOTE_WITH_AUTHOR_JOIN}
		 ORDER BY (quotes.like_count * 3 + quotes.downloads_count) DESC LIMIT ?`,
    [limit],
  )) as any[]
  const tagsByQuote = await loadTags(rows.map((r) => r.id))
  return rows.map((r) => toQQuote(r, tagsByQuote))
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
): Promise<QQuote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT * FROM quotes WHERE author_id = ? ORDER BY created_at DESC`,
    [authorId],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadRelated(rows)
  return rows.map((r) => toQQuote(r, tagsByQuote, authorsById))
}

function tagQuotesFetchedAtKey(tagSlug: string): string {
  return `tag_quotes_fetched_at:${tagSlug}`
}

/** Stamps the fetch time for a tag's quote list in _meta, so a later visit can skip the network refetch if still fresh (see getTagQuotesAge). */
export async function markTagQuotesFetched(tagSlug: string): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`, [
      tagQuotesFetchedAtKey(tagSlug),
      String(Date.now()),
    ])
  } catch (err) {
    console.error('localdb: markTagQuotesFetched failed', err)
  }
}

/** Milliseconds since a tag's quote list was last fetched from the network, or null if never. */
export async function getTagQuotesAge(tagSlug: string): Promise<number | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT value FROM _meta WHERE key = ?`, [
    tagQuotesFetchedAtKey(tagSlug),
  ])) as any[]
  if (rows.length === 0) return null
  return Date.now() - Number(rows[0].value)
}

export async function getCachedQuotesByTag(tagSlug: string): Promise<QQuote[]> {
  if (!(await ready())) return []
  const rows = (await query(
    `SELECT quotes.* FROM quotes
		 JOIN quote_tags ON quote_tags.quote_id = quotes.id
		 JOIN tags ON tags.id = quote_tags.tag_id
		 WHERE tags.slug = ? ORDER BY quotes.created_at DESC`,
    [tagSlug],
  )) as any[]
  const { tagsByQuote, authorsById } = await loadRelated(rows)
  return rows.map((r) => toQQuote(r, tagsByQuote, authorsById))
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
  const rows = (await query(
    `SELECT quotes.*, liked_quotes.created_at AS liked_at
     FROM liked_quotes
     JOIN quotes ON quotes.id = liked_quotes.quote_id
     ORDER BY liked_quotes.created_at DESC`,
  )) as any[]
  if (rows.length === 0) return []
  const { tagsByQuote, authorsById } = await loadRelated(rows)
  return rows.map((row) => ({
    quote: toQQuote(row, tagsByQuote, authorsById),
    likedAt: row.liked_at,
  }))
}

function userContentFetchedAtKey(identityKey: string): string {
  return `user_content_fetched_at:${identityKey}`
}

/** Stamps the fetch time for the signed-in/device identity's likes+downloads
 *  bundle in _meta, so app boot can skip re-running fetchUserContentBundle()
 *  on every cold start if still fresh (see getUserContentAge). Keyed per
 *  identity so switching accounts (or merging a device into one) doesn't
 *  read a stale flag left behind by a different identity. */
export async function markUserContentFetched(
  identityKey: string,
): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`, [
      userContentFetchedAtKey(identityKey),
      String(Date.now()),
    ])
  } catch (err) {
    console.error('localdb: markUserContentFetched failed', err)
  }
}

/** Milliseconds since the given identity's likes+downloads bundle was last fetched from the network, or null if never. */
export async function getUserContentAge(
  identityKey: string,
): Promise<number | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT value FROM _meta WHERE key = ?`, [
    userContentFetchedAtKey(identityKey),
  ])) as any[]
  if (rows.length === 0) return null
  return Date.now() - Number(rows[0].value)
}

function deviceMergedKey(userId: string): string {
  return `device_merged_into_account:${userId}`
}

/** True if this device's likes/downloads have already been merged into the
 *  given account (via merge_device_into_account), so a session restore on
 *  app boot/page refresh doesn't re-run the merge on every SIGNED_IN event —
 *  only an explicit new sign-in that hasn't merged this account yet should. */
export async function isDeviceMergedForUser(userId: string): Promise<boolean> {
  if (!(await ready())) return false
  const rows = (await query(`SELECT value FROM _meta WHERE key = ?`, [
    deviceMergedKey(userId),
  ])) as any[]
  return rows.length > 0
}

/** Records that this device has been merged into the given account. */
export async function markDeviceMergedForUser(userId: string): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)`, [
      deviceMergedKey(userId),
      String(Date.now()),
    ])
  } catch (err) {
    console.error('localdb: markDeviceMergedForUser failed', err)
  }
}

/** Replaces the local like-history cache with a freshly fetched one from the server. */
export async function cacheLikedQuotes(likes: LikedQuote[]): Promise<void> {
  if (!(await ready())) return
  try {
    await run(`DELETE FROM liked_quotes`)
    if (likes.length > 0) {
      const placeholders = likes.map(() => '(?, ?)').join(', ')
      const params = likes.flatMap((l) => [l.quote.id, l.likedAt])
      await run(
        `INSERT OR REPLACE INTO liked_quotes (quote_id, created_at) VALUES ${placeholders}`,
        params,
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
    if (downloads.length > 0) {
      const placeholders = downloads.map(() => '(?, ?, ?)').join(', ')
      const params = downloads.flatMap((d) => [
        d.quoteId,
        d.style ? JSON.stringify(d.style) : null,
        d.createdAt,
      ])
      await run(
        `INSERT OR REPLACE INTO downloads (quote_id, style, created_at) VALUES ${placeholders}`,
        params,
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
  const quoteRows =
    quoteIds.length === 0
      ? []
      : ((await query(
          `SELECT * FROM quotes WHERE id IN (${quoteIds.map(() => '?').join(', ')})`,
          quoteIds,
        )) as any[])
  const quotesById = new Map(quoteRows.map((r) => [r.id, r]))
  const authorsById = await getCachedAuthorsByIds([
    ...new Set(quoteRows.map((r) => r.author_id)),
  ])
  const result: Download[] = []
  for (const row of rows) {
    const quoteRow = quotesById.get(row.quote_id)
    const author = quoteRow && authorsById.get(quoteRow.author_id)
    if (!quoteRow || !author) continue
    result.push({
      quoteId: row.quote_id,
      quote: {
        id: quoteRow.id,
        text: quoteRow.text,
        author_id: quoteRow.author_id,
        author,
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
  quote: QQuote,
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

export async function getCachedQuoteOfDay(
  date: string,
): Promise<QQuote | null> {
  const byDate = await getCachedQuoteOfDayRange(date, date)
  return byDate.get(date) ?? null
}

export async function getCachedQuoteOfDayRange(
  minDate: string,
  maxDate: string,
): Promise<Map<string, QQuote>> {
  const result = new Map<string, QQuote>()
  if (!(await ready())) return result
  const rows = (await query(
    `SELECT quote_of_day.date AS date, quotes.*
     FROM quote_of_day
     JOIN quotes ON quotes.id = quote_of_day.quote_id
     WHERE quote_of_day.date BETWEEN ? AND ?`,
    [minDate, maxDate],
  )) as any[]
  if (rows.length === 0) return result
  const { tagsByQuote, authorsById } = await loadRelated(rows)
  for (const row of rows) {
    result.set(row.date, toQQuote(row, tagsByQuote, authorsById))
  }
  return result
}

/** Re-reads just the like/download count fields for a set of quotes, e.g. to
 *  reconcile an in-memory feed's stale state after returning from a detail
 *  page where a like or download happened (setLiked()/bumpDownloadsCount()
 *  keep this table current). */
export async function getQuoteCounters(
  ids: string[],
): Promise<
  Map<
    string,
    { liked_by_me: boolean; like_count: number; downloads_count: number }
  >
> {
  const result = new Map<
    string,
    { liked_by_me: boolean; like_count: number; downloads_count: number }
  >()
  if (ids.length === 0 || !(await ready())) return result
  const placeholders = ids.map(() => '?').join(',')
  const rows = (await query(
    `SELECT id, liked_by_me, like_count, downloads_count FROM quotes WHERE id IN (${placeholders})`,
    ids,
  )) as any[]
  for (const row of rows) {
    result.set(row.id, {
      liked_by_me: !!row.liked_by_me,
      like_count: row.like_count,
      downloads_count: row.downloads_count,
    })
  }
  return result
}

export async function getCachedQuote(id: string): Promise<QQuote | null> {
  if (!(await ready())) return null
  const rows = (await query(`SELECT * FROM quotes WHERE id = ?`, [id])) as any[]
  if (rows.length === 0) return null
  const { tagsByQuote, authorsById } = await loadRelated(rows)
  return toQQuote(rows[0], tagsByQuote, authorsById)
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

const CACHE_TABLES = [
  'authors',
  'quotes',
  'tags',
  'quote_tags',
  'downloads',
  'liked_quotes',
  'quote_of_day',
  'random_feed',
]

export interface StorageEstimate {
  quoteCount: number
  authorCount: number
  bytes: number
}

/** Actual on-disk size of the local SQLite cache, via page_count * page_size
 *  (exact — SQLite tracks this itself, no need to stat the file directly,
 *  which isn't reliably reachable cross-platform anyway). */
export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (!(await ready())) return { quoteCount: 0, authorCount: 0, bytes: 0 }
  const [sizeRows, quoteRows, authorRows] = await Promise.all([
    query(
      `SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()`,
    ),
    query(`SELECT COUNT(*) as n FROM quotes`),
    query(`SELECT COUNT(*) as n FROM authors`),
  ])
  return {
    bytes: Number((sizeRows as any[])[0]?.bytes ?? 0),
    quoteCount: Number((quoteRows as any[])[0]?.n ?? 0),
    authorCount: Number((authorRows as any[])[0]?.n ?? 0),
  }
}

/** Wipes all cached content tables (quotes/authors/tags/downloads/likes/
 *  quote-of-day/random-feed), keeping schema + _meta intact. Used by the
 *  settings "clear cache" action — content is re-downloaded on demand or
 *  via a fresh data pack, nothing here is the source of truth. */
export async function clearCache(): Promise<void> {
  if (!(await ready())) return
  console.debug('[sqlite] clearCache: start')
  try {
    for (const table of CACHE_TABLES) {
      await run(`DELETE FROM ${table}`)
    }
    await run(`DELETE FROM _meta WHERE key != 'schema_version'`)
    // Reclaims the freed pages — without this the file stays at its high
    //-water mark and getStorageEstimate() wouldn't reflect the clear.
    await db.execute('VACUUM;', false)
    console.debug('[sqlite] clearCache: done')
  } catch (err) {
    console.error('localdb: clearCache failed', err)
  }
}
