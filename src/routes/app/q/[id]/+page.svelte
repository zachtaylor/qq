<script lang="ts">
  import { page } from '$app/state'
  import { fetchQuoteById, fetchSimilarQuotes, setLiked } from '$lib/api/quotes'
  import { network } from '$lib/stores/network.svelte'
  import QuoteList from '$lib/components/QuoteList.svelte'
  import BackButton from '$lib/components/BackButton.svelte'
  import DetailShell from '$lib/components/DetailShell.svelte'
  import { tagChipTransition } from '$lib/viewTransition'
  import type { PageProps } from './$types'
  import Heart from '@lucide/svelte/icons/heart'
  import Download from '@lucide/svelte/icons/download'

  let { data }: PageProps = $props()

  let id = $derived(page.params.id!)
  let quote = $state(data.quote)
  let similar = $state(data.similar)
  let loading = $state(!data.quote)

  // Page data is the local SQLite snapshot. SvelteKit reuses this component
  // instance across same-route navigations (/q/[id] -> /q/[id2]), so this
  // must rerun per `id` change (not just once via onMount) — otherwise the
  // page keeps showing the previous quote's content after navigating.
  $effect(() => {
    quote = data.quote
    similar = data.similar
    loading = !data.quote
    fetchQuoteById(id)
      .then((fresh) => {
        if (fresh) quote = fresh
        return fresh ?? quote
      })
      .then((current) => {
        // Background refresh, after first paint: reconciles the tag/author
        // recency pulls against the network (data.similar above is
        // cache-only). Cached "similar" list is already showing.
        if (current) return fetchSimilarQuotes(current)
      })
      .then((fresh) => {
        // Replace outright (already sorted by popularity) — rearranging is
        // fine here since the underlying like/download counts just changed.
        if (fresh) similar = fresh
      })
      .catch(() => {})
      .finally(() => {
        loading = false
      })
  })

  let liked = $state(false)
  let count = $state(0)
  let busy = $state(false)
  let animateLike = $state(false)

  $effect(() => {
    liked = quote?.liked_by_me ?? false
    count = quote?.like_count ?? 0
  })

  const author = $derived(quote?.author ?? null)

  const quoteTextName = $derived(`quote-text-${id}`)
  const authorName = $derived(author ? `author-${author.slug}` : '')
  const authorPortraitName = $derived(
    author ? `author-portrait-${author.slug}` : '',
  )
  const tagNames = $derived(quote?.tags.map((tag) => `tag-${tag.slug}`) ?? [])

  async function toggleLike() {
    if (busy || network.offline || !quote) return
    busy = true
    const wasLiked = liked
    liked = !liked
    count += liked ? 1 : -1
    if (!wasLiked && liked) {
      animateLike = true
    }
    try {
      await setLiked(quote.id, liked)
    } catch {
      liked = !liked
      count += liked ? 1 : -1
      animateLike = false
    } finally {
      busy = false
    }
  }
</script>

{#key id}
  <DetailShell>
    {#if quote || loading}
      <div class="mb-8 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <BackButton />
          {#if quote && author}
            <div class="flex items-center gap-2">
              {#if author.portrait_url}
                <img
                  src={author.portrait_url}
                  alt={author.name}
                  class="h-8 w-8 rounded-full object-cover ring-1 ring-stone-200"
                  style={authorPortraitName
                    ? `view-transition-name: ${authorPortraitName}`
                    : ''}
                />
              {/if}
              <a
                href="/app/authors/{author.slug}"
                class="text-sm font-medium text-accent hover:underline"
                style={authorName ? `view-transition-name: ${authorName}` : ''}
              >
                {author.name}
              </a>
            </div>
          {/if}
        </div>
        {#if quote}
          <div class="flex items-center gap-4">
            <button
              onclick={toggleLike}
              disabled={network.offline}
              class="flex items-center gap-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 {liked
                ? 'text-accent'
                : 'text-stone-400 hover:text-stone-600'}"
              aria-pressed={liked}
              aria-label="Like"
            >
              <Heart
                class="size-4 {animateLike ? 'animate-like-pop' : ''}"
                onanimationend={() => (animateLike = false)}
                fill={liked ? 'currentColor' : 'none'}
              />{count}
            </button>
            {#if network.offline}
              <span
                class="text-stone-300"
                aria-label="Share unavailable offline"
              >
                <Download class="size-4" />
              </span>
            {:else}
              <a
                href="/app/share/{quote.id}"
                class="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600"
                aria-label="Share"
              >
                <Download class="size-4" />{quote.downloads_count}
              </a>
            {/if}
          </div>
        {/if}
      </div>

      <blockquote
        class="font-serif text-4xl leading-snug text-stone-800 sm:text-4xl"
        style="view-transition-name: {quoteTextName}"
      >
        {#if quote}"{quote.text}"{/if}
      </blockquote>

      {#if quote && quote.tags.length > 0}
        <div class="mt-5 flex flex-wrap gap-1.5">
          {#each quote.tags as tag (tag.id)}
            <a
              href="/app/tags/{tag.slug}"
              class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200"
              style="view-transition-name: tag-{tag.slug}"
              onclick={(e) => tagChipTransition(e.currentTarget, tag.slug)}
            >
              #{tag.name}
            </a>
          {/each}
        </div>
      {/if}

      {#if quote}
        <div class="mt-10 flex items-center justify-between">
          <h2 class="font-semibold text-stone-800">Similar quotes</h2>
          <a
            href="/app/tabs/trending"
            class="text-sm text-accent hover:underline">See what's trending →</a
          >
        </div>
        <div class="mt-3">
          <QuoteList
            quotes={similar}
            empty="No similar quotes yet."
            takenAuthorNames={authorName ? [authorName] : []}
            takenTagNames={tagNames}
          />
        </div>
      {/if}
    {:else}
      <p class="py-12 text-center text-sm text-stone-400">Quote not found.</p>
    {/if}
  </DetailShell>
{/key}
