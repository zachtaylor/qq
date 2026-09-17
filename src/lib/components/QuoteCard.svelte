<script lang="ts">
  import type { QQuote } from '$lib/types'
  import { setLiked } from '$lib/api/quotes'
  import { network } from '$lib/stores/network.svelte'
  import { tagQuoteTransition, tagChipTransition } from '$lib/viewTransition'
  import Heart from '@lucide/svelte/icons/heart'
  import Download from '@lucide/svelte/icons/download'

  let {
    quote,
    tagQuoteText = true,
    tagAuthor = true,
    tagChipFlags = [],
  }: {
    quote: QQuote
    /** Whether this card may claim the static quote-text-{id}/author-{slug}
     *  view-transition-names. The View Transitions API errors if the same
     *  name is assigned to more than one on-screen element — callers
     *  (QuoteList) must dedupe across the whole list/page and pass false
     *  for every occurrence after the first. */
    tagQuoteText?: boolean
    tagAuthor?: boolean
    /** Per-tag (by index into `quote.tags`) whether this card's chip may
     *  claim the static `tag-{slug}` view-transition-name — same dedupe
     *  contract as `tagAuthor`, but per-chip since a card can show several
     *  tags and each repeats independently across the list. */
    tagChipFlags?: boolean[]
  } = $props()

  let liked = $state(quote.liked_by_me)
  let count = $state(quote.like_count)
  let busy = $state(false)
  let animateLike = $state(false)

  let articleEl: HTMLElement | undefined

  const author = $derived(quote.author)

  const quoteTextName = `quote-text-${quote.id}`
  const authorName = $derived(`author-${author.slug}`)

  function onNavigateClick() {
    if (articleEl) tagQuoteTransition(articleEl, quote.id, author.slug)
  }

  async function toggleLike() {
    if (busy || network.offline) return
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

<article
  bind:this={articleEl}
  class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200"
>
  <a href="/app/q/{quote.id}" class="block" onclick={onNavigateClick}>
    <blockquote
      data-transition="quote-text"
      class="font-serif text-xl leading-relaxed text-stone-800"
      style={tagQuoteText ? `view-transition-name: ${quoteTextName}` : ''}
    >
      “{quote.text}”
    </blockquote>
  </a>
  {#if quote.tags.length > 0}
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each quote.tags as tag, i (tag.id)}
        <a
          href="/app/tags/{tag.slug}"
          class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 hover:bg-stone-200"
          style={tagChipFlags[i] ? `view-transition-name: tag-${tag.slug}` : ''}
          onclick={(e) => tagChipTransition(e.currentTarget, tag.slug)}
        >
          #{tag.name}
        </a>
      {/each}
    </div>
  {/if}
  <div class="mt-4 flex items-center justify-between">
    <a
      href="/app/authors/{author.slug}"
      data-transition="author"
      class="text-sm font-medium text-accent hover:underline"
      style={tagAuthor ? `view-transition-name: ${authorName}` : ''}
      onclick={onNavigateClick}
    >
      — {author.name}
    </a>
    <div class="ml-auto flex items-center gap-4">
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
        <span class="text-stone-300" aria-label="Share unavailable offline">
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
  </div>
</article>
