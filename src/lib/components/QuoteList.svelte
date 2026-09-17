<script lang="ts">
  import type { QQuote } from '$lib/types'
  import { dedupeTransitionNames } from '$lib/viewTransition'
  import QuoteCard from './QuoteCard.svelte'

  let {
    load,
    key,
    quotes: quotesProp,
    empty = 'No quotes yet.',
    takenAuthorNames = [],
    takenTagNames = [],
  }: {
    load?: () => Promise<QQuote[]>
    /** Reactive identity for `load` (e.g. the current tag slug). `load`
     *  itself is typically a fresh closure every render, so it can't be
     *  used as an effect dependency directly — without this, re-fetching
     *  on a new `load` would either never re-run (if not tracked at all)
     *  or run on every unrelated re-render (if `load()` were called
     *  directly in the template, as an unkeyed `{#await load()}` would).
     *  Fetched `quotes` are updated in place rather than remounting the
     *  list, so on-screen cards don't jump/reset between loads. */
    key?: string
    quotes?: QQuote[]
    empty?: string
    /** `author-{slug}` view-transition-names already claimed elsewhere on
     *  the page (e.g. a detail page's own header) — this list must not
     *  re-claim any of them for a matching card. */
    takenAuthorNames?: string[]
    /** Same idea as `takenAuthorNames`, for `tag-{slug}` names (e.g. the
     *  `#slug` heading on the tag search page itself). */
    takenTagNames?: string[]
  } = $props()

  let loaded: QQuote[] | undefined = $state(undefined)
  let error: Error | null = $state(null)

  $effect(() => {
    key
    if (!load) return
    error = null
    load()
      .then((result) => {
        loaded = result
      })
      .catch((err) => {
        error = err
      })
  })
</script>

{#snippet list(quotes: QQuote[])}
  {#if quotes.length === 0}
    <p class="py-12 text-center text-sm text-stone-400">{empty}</p>
  {:else}
    {@const authorNames = quotes.map((q) => `author-${q.author.slug}`)}
    {@const tagAuthorFlags = dedupeTransitionNames(
      authorNames,
      new Set(takenAuthorNames),
    )}
    {@const tagChipFlagsByQuote = (() => {
      const seen = new Set(takenTagNames)
      return quotes.map((q) =>
        q.tags.map((tag) => {
          const name = `tag-${tag.slug}`
          if (seen.has(name)) return false
          seen.add(name)
          return true
        }),
      )
    })()}
    <div class="flex flex-col gap-3">
      {#each quotes as quote, i (quote.id)}
        <QuoteCard
          {quote}
          tagAuthor={tagAuthorFlags[i]}
          tagChipFlags={tagChipFlagsByQuote[i]}
        />
      {/each}
    </div>
  {/if}
{/snippet}

{#if quotesProp}
  {@render list(quotesProp)}
{:else if error}
  <p class="py-12 text-center text-sm text-red-500">
    Failed to load: {error.message}
  </p>
{:else if loaded}
  {@render list(loaded)}
{:else}
  <p class="py-12 text-center text-sm text-stone-400">Loading…</p>
{/if}
