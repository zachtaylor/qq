<script lang="ts">
  import type { Quote } from '$lib/types'
  import QuoteCard from './QuoteCard.svelte'

  let {
    load,
    key,
    quotes: quotesProp,
    empty = 'No quotes yet.',
    hideAuthor = false,
  }: {
    load?: () => Promise<Quote[]>
    /** Reactive identity for `load` (e.g. the current tag slug). `load`
     *  itself is typically a fresh closure every render, so it can't be
     *  used as an effect dependency directly — without this, re-fetching
     *  on a new `load` would either never re-run (if not tracked at all)
     *  or run on every unrelated re-render (if `load()` were called
     *  directly in the template, as an unkeyed `{#await load()}` would).
     *  Fetched `quotes` are updated in place rather than remounting the
     *  list, so on-screen cards don't jump/reset between loads. */
    key?: string
    quotes?: Quote[]
    empty?: string
    hideAuthor?: boolean
  } = $props()

  let loaded: Quote[] | undefined = $state(undefined)
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

{#snippet list(quotes: Quote[])}
  {#if quotes.length === 0}
    <p class="py-12 text-center text-sm text-stone-400">{empty}</p>
  {:else}
    {@const seenAuthors = new Set<string>()}
    <div class="flex flex-col gap-3">
      {#each quotes as quote (quote.id)}
        {@const isFirstForAuthor = !seenAuthors.has(quote.author.slug)}
        {@const _a = seenAuthors.add(quote.author.slug)}
        <QuoteCard {quote} {hideAuthor} nameTransition={isFirstForAuthor} />
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
