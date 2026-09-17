// Shared Wikipedia lookup used to backfill author bio/portrait_url/
// born_year/died_year. Deno edge functions can't import from scripts/, so
// this logic is duplicated inline in
// supabase/functions/ingest-zenquotes/index.ts — keep the two in sync,
// same as tag-taxonomy.mjs / the edge function's TAG_RULES.

const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
const BIO_MAX_CHARS = 300

// Matches "(1835–1910)" or "(born 1935)" style year hints in the short
// Wikipedia description, e.g. "American author and humorist (1835–1910)".
const YEAR_RANGE_RE = /\((?:born\s+)?(\d{4})(?:\s*[–-]\s*(\d{4}))?\)/

function truncateBio(text) {
  if (text.length <= BIO_MAX_CHARS) return text
  const cut = text.slice(0, BIO_MAX_CHARS)
  const lastPeriod = cut.lastIndexOf('. ')
  return lastPeriod > 0 ? cut.slice(0, lastPeriod + 1) : cut.trimEnd() + '…'
}

// Looks up an author by name on Wikipedia and returns whatever subset of
// { bio, portrait_url, born_year, died_year } it could find. Returns null
// if there's no matching page (common for misattributed/fictional
// ZenQuotes authors) or the page is a disambiguation page.
export async function lookupAuthor(name) {
  const title = encodeURIComponent(name.trim().replace(/\s+/g, '_'))
  let res
  try {
    res = await fetch(SUMMARY_URL + title, {
      headers: { accept: 'application/json' },
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  const data = await res.json()
  if (data.type === 'disambiguation') return null

  const result = {}

  if (data.extract) {
    result.bio = truncateBio(data.extract.trim())
  }
  if (data.thumbnail?.source) {
    result.portrait_url = data.thumbnail.source
  }
  const yearMatch = data.description?.match(YEAR_RANGE_RE)
  if (yearMatch) {
    result.born_year = Number(yearMatch[1])
    if (yearMatch[2]) result.died_year = Number(yearMatch[2])
  }

  return Object.keys(result).length > 0 ? result : null
}
