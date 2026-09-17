// One-off / rerunnable backfill: tags every quote that has no rows in
// quote_tags yet, using the fixed keyword taxonomy in tag-taxonomy.mjs.
// Safe to rerun — only touches quotes with zero existing tags, and
// add_quote_tags() itself is idempotent (on conflict do nothing).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/retag-quotes.mjs [--dry-run]
//
// Get the service role key with:
//   npx supabase projects api-keys --project-ref ayrgvvslpogfqjfsuzqe
// Never commit it — pass it via env only.

import { createClient } from '@supabase/supabase-js'
import { tagsForText } from './tag-taxonomy.mjs'

const dryRun = process.argv.includes('--dry-run')
const PAGE_SIZE = 100 // keeps the quote_tags .in(quoteIds) filter under PostgREST's header size limit

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(url, key)

async function fetchUntaggedPage(offset) {
  // quotes with no quote_tags row: left-join-ish via a not-in subquery,
  // done client-side in two queries since supabase-js can't express
  // "left join where null" directly on postgrest.
  const { data, error } = await supabase
    .from('quotes')
    .select('id, text')
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)
  if (error) throw error
  return data
}

async function fetchTaggedIds(quoteIds) {
  if (quoteIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('quote_tags')
    .select('quote_id')
    .in('quote_id', quoteIds)
  if (error) throw error
  return new Set(data.map((r) => r.quote_id))
}

async function main() {
  let offset = 0
  let tagged = 0
  let skippedAlreadyTagged = 0
  let skippedNoMatch = 0

  for (;;) {
    const page = await fetchUntaggedPage(offset)
    if (page.length === 0) break
    offset += page.length

    const taggedIds = await fetchTaggedIds(page.map((q) => q.id))

    for (const quote of page) {
      if (taggedIds.has(quote.id)) {
        skippedAlreadyTagged++
        continue
      }
      const tags = tagsForText(quote.text)
      if (tags.length === 0) {
        skippedNoMatch++
        continue
      }
      if (dryRun) {
        console.log(
          `[dry-run] ${quote.id} ${JSON.stringify(tags)} :: ${quote.text.slice(0, 60)}`,
        )
      } else {
        const { error } = await supabase.rpc('add_quote_tags', {
          target_quote_id: quote.id,
          tag_names: tags,
        })
        if (error) {
          console.error(`failed to tag ${quote.id}`, error)
          continue
        }
      }
      tagged++
    }
  }

  console.log({ tagged, skippedAlreadyTagged, skippedNoMatch, dryRun })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
