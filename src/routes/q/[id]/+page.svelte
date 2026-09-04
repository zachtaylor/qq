<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { fetchQuoteById, setLiked } from '$lib/api/quotes'
  import { network } from '$lib/stores/network.svelte'
  import QuoteList from '$lib/components/QuoteList.svelte'
  import type { PageProps } from './$types'

  let { data }: PageProps = $props()

  let id = $derived(page.params.id!)
  let quote = $state(data.quote)
  let loading = $state(!data.quote)

  // Page data is the local SQLite snapshot. SvelteKit reuses this component
  // instance across same-route navigations (/q/[id] -> /q/[id2]), so this
  // must rerun per `id` change (not just once via onMount) — otherwise the
  // page keeps showing the previous quote's content after navigating.
  $effect(() => {
    quote = data.quote
    loading = !data.quote
    fetchQuoteById(id)
      .then((fresh) => {
        if (fresh) quote = fresh
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

  function back() {
    history.length > 1 ? history.back() : goto('/app')
  }

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

<div
  class="mx-auto min-h-screen max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-6 lg:max-w-4xl"
>
  {#if quote || loading}
    <div class="mb-8 flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <button
          onclick={back}
          aria-label="Back"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-lg text-stone-600 shadow-sm ring-1 ring-stone-200 backdrop-blur-xl hover:text-stone-900"
        >
          ←
        </button>
        {#if quote}
          <a
            href="/authors/{quote.author.slug}"
            class="text-sm font-medium text-accent hover:underline"
            style="view-transition-name: author-{quote.author.slug}"
          >
            {quote.author.name}
          </a>
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
            <span
              class="text-base"
              class:animate-like-pop={animateLike}
              onanimationend={() => (animateLike = false)}
              >{liked ? '♥' : '♡'}</span
            >{count}
          </button>
          {#if network.offline}
            <span class="text-stone-300" aria-label="Share unavailable offline"
              >⇪</span
            >
          {:else}
            <a
              href="/share/{quote.id}"
              class="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-600"
              aria-label="Share"
            >
              <span class="text-base">⇪</span>{quote.downloads_count}
            </a>
          {/if}
        </div>
      {/if}
    </div>

    <blockquote
      class="font-serif text-4xl leading-snug text-stone-800 sm:text-4xl"
      style="view-transition-name: quote-text-{id}"
    >
      {#if quote}“{quote.text}”{/if}
    </blockquote>

    {#if quote && quote.tags.length > 0}
      <div class="mt-5 flex flex-wrap gap-1.5">
        {#each quote.tags as tag (tag.id)}
          <a
            href="/tags/{tag.slug}"
            class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200"
          >
            #{tag.name}
          </a>
        {/each}
      </div>
    {/if}

    {#if quote}
      <div class="mt-10 flex items-center justify-between">
        <h2 class="font-semibold text-stone-800">Similar quotes</h2>
        <a href="/app/trending" class="text-sm text-accent hover:underline"
          >See what's trending →</a
        >
      </div>
      <div class="mt-3">
        <QuoteList
          quotes={data.similar}
          empty="No similar quotes yet."
          hideAuthor
        />
      </div>
    {/if}
  {:else}
    <p class="py-12 text-center text-sm text-stone-400">Quote not found.</p>
  {/if}
</div>
