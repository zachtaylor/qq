// Scheduled Edge Function: pulls batches of quotes from the ZenQuotes free
// API and upserts them into `quotes`/`authors`. ZenQuotes has no bulk export
// endpoint — /api/quotes returns ~50 random quotes per call — so this job is
// designed to run repeatedly (e.g. hourly) via Supabase's pg_cron + pg_net,
// gradually building up the library while deduping on (author, text).
// ZenQuotes doesn't supply subject tags, so ingested quotes land untagged;
// tagging is a separate curation step (see add_quote_tags in schema.sql).
//
// Deploy: supabase functions deploy ingest-zenquotes --no-verify-jwt
// Schedule: see supabase/cron.sql

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ZENQUOTES_URL = 'https://zenquotes.io/api/quotes'
const BATCHES_PER_RUN = 3 // ZenQuotes free tier: ~5 req/30s, so pace it out
const DELAY_MS = 4000

interface ZenQuote {
  q: string
  a: string
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const seen = new Map<string, string>() // "author|text" -> author id, cached this run
  let inserted = 0
  let skipped = 0
  let failedBatches = 0

  for (let i = 0; i < BATCHES_PER_RUN; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS))

    let batch: ZenQuote[]
    try {
      const res = await fetch(ZENQUOTES_URL, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`zenquotes ${res.status}`)
      batch = await res.json()
    } catch (err) {
      console.error('batch fetch failed', err)
      failedBatches++
      continue
    }

    for (const item of batch) {
      const text = item.q?.trim()
      const authorName = item.a?.trim() || 'Unknown'
      if (!text || text.length < 3) continue

      const key = `${authorName.toLowerCase()}|${text.toLowerCase()}`
      if (seen.has(key)) {
        skipped++
        continue
      }

      let authorId = seen.get(`author:${authorName.toLowerCase()}`)
      if (!authorId) {
        const slug = slugify(authorName) || 'unknown'
        const { data: existing } = await supabase
          .from('authors')
          .select('id')
          .ilike('name', authorName)
          .maybeSingle()

        if (existing) {
          authorId = existing.id
        } else {
          const { data: created, error: authorErr } = await supabase
            .from('authors')
            .insert({ name: authorName, slug })
            .select('id')
            .single()
          if (authorErr) {
            // slug collision or race — fall back to lookup
            const { data: retry } = await supabase
              .from('authors')
              .select('id')
              .ilike('name', authorName)
              .maybeSingle()
            if (!retry) {
              console.error('author upsert failed', authorName, authorErr)
              continue
            }
            authorId = retry.id
          } else {
            authorId = created.id
          }
        }
        seen.set(`author:${authorName.toLowerCase()}`, authorId!)
      }

      seen.set(key, authorId!)

      const { error: quoteErr } = await supabase
        .from('quotes')
        .upsert(
          { text, author_id: authorId, source: 'zenquotes' },
          { onConflict: 'author_id,text', ignoreDuplicates: true },
        )

      if (quoteErr) {
        console.error('quote upsert failed', quoteErr)
      } else {
        inserted++
      }
    }
  }

  return new Response(JSON.stringify({ inserted, skipped, failedBatches }), {
    headers: { 'content-type': 'application/json' },
  })
})
