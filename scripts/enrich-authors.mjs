// One-off / rerunnable backfill: fills in bio/portrait_url/born_year/
// died_year for authors missing any of them, via Wikipedia's public REST
// summary API (see wikipedia-enrich.mjs). Never overwrites existing
// values — only fills currently-null fields. Safe to rerun.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/enrich-authors.mjs [--dry-run]
//
// Get the service role key with:
//   npx supabase projects api-keys --project-ref ayrgvvslpogfqjfsuzqe
// Never commit it — pass it via env only.

import { createClient } from '@supabase/supabase-js'
import { lookupAuthor } from './wikipedia-enrich.mjs'

const dryRun = process.argv.includes('--dry-run')
const DELAY_MS = 200 // be polite to Wikipedia across hundreds of lookups

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(url, key)

// Fetched once, in full: paging with .range() against this filter would
// skip rows, since each update we make removes a row from the filter and
// shifts every later row's offset up by one.
async function fetchIncomplete() {
  const { data, error } = await supabase
    .from('authors')
    .select('id, name, bio, portrait_url, born_year, died_year')
    .or('bio.is.null,portrait_url.is.null,born_year.is.null')
    .order('id', { ascending: true })
  if (error) throw error
  return data
}

async function main() {
  const authors = await fetchIncomplete()
  let enriched = 0
  let skippedNoMatch = 0
  let skippedNoNewFields = 0

  for (const author of authors) {
    const found = await lookupAuthor(author.name)
    await new Promise((r) => setTimeout(r, DELAY_MS))

    if (!found) {
      skippedNoMatch++
      continue
    }

    // Only fill fields that are currently null — never clobber
    // hand-curated seed data.
    const patch = {}
    if (author.bio == null && found.bio) patch.bio = found.bio
    if (author.portrait_url == null && found.portrait_url)
      patch.portrait_url = found.portrait_url
    if (author.born_year == null && found.born_year)
      patch.born_year = found.born_year
    if (author.died_year == null && found.died_year)
      patch.died_year = found.died_year

    if (Object.keys(patch).length === 0) {
      skippedNoNewFields++
      continue
    }

    if (dryRun) {
      console.log(`[dry-run] ${author.name} :: ${JSON.stringify(patch)}`)
    } else {
      const { error } = await supabase
        .from('authors')
        .update(patch)
        .eq('id', author.id)
      if (error) {
        console.error(`failed to update ${author.name}`, error)
        continue
      }
    }
    enriched++
  }

  console.log({ enriched, skippedNoMatch, skippedNoNewFields, dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
